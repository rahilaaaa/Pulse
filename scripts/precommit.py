#!/usr/bin/env python
"""Run Pulse validation checks without changing the development database.

The default run is the fast set used by the Git hook. ``--full`` adds the
Django test suite and the frontend production build. This script never
initializes Git, installs packages, applies migrations, or stages files.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True


def _configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            continue


def _safe_print(text: str) -> None:
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        safe = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
        print(safe, flush=True)


_configure_stdio()

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
HOOK_MARKER = "# pulse-precommit-hook"
HOOK_SCRIPT = """#!/bin/sh
# pulse-precommit-hook
# Fast Pulse checks. A non-zero Python status rejects the commit.
set -eu
cd "$(dirname "$0")/../.." || exit 1
exec .venv/Scripts/python.exe scripts/precommit.py
"""
LOCAL_SETTINGS = "config.settings.local"
TEST_SETTINGS = "config.settings.test"
SENSITIVE_KEY = re.compile(
    r"(PASSWORD|SECRET|TOKEN|PRIVATE|API_KEY|ACCESS_KEY|CREDENTIAL|DATABASE_URL|DSN)",
    re.I,
)
EXAMPLE_ENV_SUFFIXES = (".example", ".sample", ".template")
PRIVATE_KEY_NAMES = {"id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"}
PRIVATE_KEY_SUFFIXES = (".pem", ".p12", ".pfx", ".key")
PLACEHOLDER_PREFIXES = (
    "replace-with",
    "changeme",
    "change-me",
    "change_me",
    "your-",
    "your_",
    "todo",
    "placeholder",
    "example",
    "xxx",
    "dummy",
    "password",
    "<",
)
DB_PROBE = r"""
import os
import sys

os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.local"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.path.insert(0, ".")
try:
    import django
    from django.db import connections

    django.setup()
    connections["default"].ensure_connection()
    connections.close_all()
except Exception as exc:
    sys.stderr.write(f"{type(exc).__name__}: {exc}")
    sys.exit(1)
"""
TEST_GUARD = r"""
import os
import sys

os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings.test"
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
sys.path.insert(0, ".")
try:
    import django
    from django.conf import settings

    django.setup()
    db = settings.DATABASES["default"]
    name = str(db.get("NAME") or "")
    test = db.get("TEST") or {}
    test_name = str(test.get("NAME") or "") or ("test_" + name)
    mirror = str(test.get("MIRROR") or "")
    engine = str(db.get("ENGINE") or "")
    if mirror or not name or test_name == name or engine != "django.db.backends.postgresql":
        sys.stderr.write(
            "Refusing to run tests because they are not pointed at a separate PostgreSQL test database.\n"
        )
        sys.exit(3)
    from django.db import connections

    connections.close_all()
except SystemExit:
    raise
except Exception as exc:
    sys.stderr.write(f"{type(exc).__name__}: {exc}")
    sys.exit(1)
sys.stdout.write("separate-test-database\n")
"""


class Reporter:
    def __init__(self) -> None:
        self.rows: list[str] = []
        self.secrets = _secret_values()

    def add(
        self,
        status: str,
        name: str,
        detail: str = "",
        output: str = "",
        *,
        show_output: bool = False,
    ) -> None:
        detail = " ".join(self.redact(detail).split())
        output = self.redact(output).strip()
        self.rows.append(status)
        line = f"[{status}] {name}"
        if detail:
            line += f" - {detail}"
        _safe_print(line)
        if output and (status == "FAIL" or show_output):
            _print_block(output)

    def redact(self, text: str) -> str:
        redacted = text
        for secret in self.secrets:
            redacted = re.sub(
                rf"(?<![A-Za-z0-9]){re.escape(secret)}(?![A-Za-z0-9])",
                "[redacted]",
                redacted,
            )
        redacted = re.sub(
            r"://([^:@/\s]+):([^@/\s]+)@",
            r"://\1:[redacted]@",
            redacted,
        )
        redacted = re.sub(
            r"(?i)\b(password|secret|token|api_key)\b(\s*[=:]\s*)('[^']*'|\"[^\"]*\"|\S+)",
            r"\1\2[redacted]",
            redacted,
        )
        return redacted

    @property
    def failed(self) -> int:
        return self.rows.count("FAIL")


def _secret_values() -> list[str]:
    values: list[str] = []
    for env_path in (ROOT / ".env", BACKEND / ".env", FRONTEND / ".env"):
        if not env_path.is_file():
            continue
        try:
            lines = env_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        values.extend(_sensitive_assignments(lines))
    for key, value in os.environ.items():
        if SENSITIVE_KEY.search(key) and len(value) >= 4:
            values.append(value)
    return sorted(set(values), key=len, reverse=True)


def _sensitive_assignments(lines: list[str]) -> list[str]:
    found: list[str] = []
    for line in lines:
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        if key.lower().startswith("export "):
            key = key.split(None, 1)[1].strip()
        value = value.strip().strip('"').strip("'")
        if SENSITIVE_KEY.search(key) and len(value) >= 4:
            found.append(value)
    return found


def _print_block(output: str) -> None:
    lines = output.splitlines() or [output]
    omitted = 0
    if len(lines) > 200:
        omitted = len(lines) - 200
        lines = lines[-200:]
    if omitted:
        _safe_print(f"  ... {omitted} earlier lines omitted")
    for line in lines:
        if len(line) > 500:
            line = line[:500] + " ... [truncated]"
        _safe_print(f"  {line}")


def _base_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def run_command(argv: list[str] | str, cwd: Path, *, shell: bool = False) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            argv,
            cwd=cwd,
            env=_base_env(),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=shell,
        )
    except OSError as exc:
        return 127, f"{type(exc).__name__}: {exc}"
    chunks = [part.strip() for part in (completed.stdout, completed.stderr) if part and part.strip()]
    return completed.returncode, "\n".join(chunks)


def run_python_stdin(source: str, cwd: Path) -> tuple[int, str]:
    try:
        completed = subprocess.run(
            [sys.executable, "-"],
            cwd=cwd,
            env=_base_env(),
            input=source,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        return 127, f"{type(exc).__name__}: {exc}"
    chunks = [part.strip() for part in (completed.stdout, completed.stderr) if part and part.strip()]
    return completed.returncode, "\n".join(chunks)


def manage(arguments: list[str]) -> tuple[int, str]:
    return run_command([sys.executable, str(BACKEND / "manage.py"), *arguments], BACKEND)


def _basename(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def _is_example_env(path: str) -> bool:
    name = _basename(path).lower()
    return name.startswith(".env") and name.endswith(EXAMPLE_ENV_SUFFIXES)


def _is_real_env(path: str) -> bool:
    name = _basename(path).lower()
    return not _is_example_env(path) and (name == ".env" or name.startswith(".env."))


def _is_private_key_path(path: str) -> bool:
    name = _basename(path).lower()
    if name.endswith(".pub"):
        return False
    return name in PRIVATE_KEY_NAMES or name.endswith(PRIVATE_KEY_SUFFIXES)


def _is_credential_path(path: str) -> bool:
    name = _basename(path).lower()
    if name in {"credentials.json", "secrets.json"}:
        return True
    return name.endswith(".json") and (
        name.startswith("service-account") or name.startswith("serviceaccount")
    )


def _is_dump_path(path: str) -> bool:
    normalized = path.replace("\\", "/").lower().strip("/")
    name = _basename(normalized)
    if name.endswith((".dump", ".backup", ".sql.gz", ".sql.bz2", ".dump.gz")):
        return True
    if "pg_dump" in name or name == "pgdata":
        return True
    return normalized == ".local/pgdata" or "/pgdata/" in f"/{normalized}/" or normalized.startswith(".local/pgdata/")


def _is_placeholder(value: str) -> bool:
    candidate = value.strip().strip('"').strip("'")
    if candidate == "":
        return True
    lowered = candidate.lower()
    if lowered in {"none", "null", "false", "true", "secret", "password"}:
        return True
    return lowered.startswith(PLACEHOLDER_PREFIXES)


def _example_env_problems(blob: bytes) -> list[str]:
    if _blob_has_private_key(blob):
        return ["contains a private-key header"]
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError:
        return ["example environment file is not valid UTF-8"]
    problems: list[str] = []
    for lineno, line in enumerate(text.splitlines(), 1):
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        if key.lower().startswith("export "):
            key = key.split(None, 1)[1].strip()
        if not SENSITIVE_KEY.search(key):
            continue
        if _is_placeholder(value):
            continue
        problems.append(f"{key} on line {lineno} is not a placeholder")
    return problems


def _blob_has_private_key(blob: bytes) -> bool:
    # Build the PEM header pattern at runtime so this source file does not
    # contain contiguous private-key header literals that would self-match.
    sample = blob if len(blob) <= 2_000_000 else blob[:65536] + blob[-65536:]
    dashes = b"-" * 5
    pattern = re.compile(
        re.escape(dashes + b"BEGIN ")
        + rb"[A-Z0-9 ]*"
        + re.escape(b" PRIVATE KEY" + dashes)
    )
    return pattern.search(sample) is not None


def _blob_is_dump(blob: bytes) -> bool:
    head = blob[:4096]
    return head.startswith(b"PGDMP") or b"PostgreSQL database dump" in head


def _staged_paths() -> tuple[int, list[str], str]:
    try:
        completed = subprocess.run(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
            cwd=ROOT,
            env=_base_env(),
            stdin=subprocess.DEVNULL,
            capture_output=True,
        )
    except OSError as exc:
        return 127, [], f"{type(exc).__name__}: {exc}"
    if completed.returncode != 0:
        message = completed.stderr.decode("utf-8", "replace").strip() or "git diff --cached failed"
        return completed.returncode, [], message
    paths = [
        item.decode("utf-8", "replace").replace("\\", "/")
        for item in completed.stdout.split(b"\0")
        if item
    ]
    return 0, paths, ""


def _staged_blob(path: str) -> tuple[bool, bytes]:
    completed = subprocess.run(
        ["git", "show", f":{path}"],
        cwd=ROOT,
        env=_base_env(),
        stdin=subprocess.DEVNULL,
        capture_output=True,
    )
    if completed.returncode != 0:
        return False, b""
    return True, completed.stdout


def _reasons_for_staged(path: str) -> list[str]:
    readable, blob = _staged_blob(path)
    reasons: list[str] = []
    if _is_example_env(path):
        if not readable:
            return ["example environment file could not be read"]
        return _example_env_problems(blob)
    if _is_real_env(path):
        reasons.append("real environment file")
    if _is_private_key_path(path):
        reasons.append("private-key filename")
    if _is_credential_path(path):
        reasons.append("credential filename")
    if _is_dump_path(path):
        reasons.append("database dump filename")
    if not readable:
        if reasons:
            reasons.append("staged content could not be read")
        return reasons
    if _blob_has_private_key(blob):
        reasons.append("private-key header")
    if _blob_is_dump(blob):
        reasons.append("database dump header")
    return reasons


def check_staged_secrets(report: Reporter) -> None:
    if not (ROOT / ".git").exists():
        report.add(
            "SKIP",
            "staged secrets",
            "this directory is not a Git repository",
        )
        return
    if shutil.which("git") is None:
        report.add("FAIL", "staged secrets", "git was not found on PATH")
        return
    code, paths, error = _staged_paths()
    if code != 0:
        report.add("FAIL", "staged secrets", "could not list staged files", error)
        return
    if not paths:
        report.add("PASS", "staged secrets", "no staged files")
        return
    blocked: list[str] = []
    for path in paths:
        reasons = _reasons_for_staged(path)
        if reasons:
            blocked.append(f"{path}: {', '.join(reasons)}")
    if blocked:
        report.add(
            "FAIL",
            "staged secrets",
            f"{len(blocked)} staged file(s) blocked",
            "\n".join(blocked),
        )
        return
    report.add("PASS", "staged secrets", f"{len(paths)} staged file(s) checked")


def check_python_syntax(report: Reporter) -> None:
    errors: list[str] = []
    checked = 0
    for path in sorted(BACKEND.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        checked += 1
        try:
            source = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"{path.relative_to(ROOT)}: {exc.__class__.__name__}")
            continue
        except UnicodeDecodeError:
            errors.append(f"{path.relative_to(ROOT)}: file is not valid UTF-8")
            continue
        try:
            compile(source, str(path.relative_to(ROOT)), "exec")
        except SyntaxError as exc:
            errors.append(f"{path.relative_to(ROOT)}:{exc.lineno}: {exc.msg}")
    if checked == 0:
        report.add("FAIL", "python syntax", "no Python files were found under backend/")
        return
    if errors:
        report.add("FAIL", "python syntax", f"{len(errors)} file(s) failed", "\n".join(errors))
        return
    report.add("PASS", "python syntax", f"{checked} files compiled in memory")


def check_django(report: Reporter, name: str, arguments: list[str], success_detail: str) -> bool:
    code, output = manage(arguments)
    if code == 0:
        show = "warning" in output.lower() or "system check identified some issues" in output.lower()
        report.add("PASS", name, success_detail, output, show_output=show)
        return True
    if not output:
        output = "The command failed without an error message."
    report.add("FAIL", name, f"exit code {code}", output)
    return False


def check_pending_migrations(report: Reporter, database_ok: bool) -> None:
    if not database_ok:
        report.add("SKIP", "pending migrations", "development database connection failed")
        return
    code, output = manage(["migrate", "--check", "--noinput", f"--settings={LOCAL_SETTINGS}"])
    if code == 0:
        report.add("PASS", "pending migrations", "no unapplied migrations")
        return
    if not output:
        output = "Unapplied migrations are present. migrate --check does not apply them."
    report.add("FAIL", "pending migrations", f"exit code {code}", output)


def check_typescript(report: Reporter) -> None:
    node = shutil.which("node")
    tsc_js = FRONTEND / "node_modules" / "typescript" / "lib" / "tsc.js"
    if node is None:
        report.add("FAIL", "typescript", "node was not found on PATH")
        return
    if not tsc_js.is_file():
        report.add(
            "FAIL",
            "typescript",
            "frontend/node_modules/typescript is missing. Run npm install in frontend/. Packages were not installed.",
        )
        return
    code, output = run_command(
        [node, str(tsc_js), "--noEmit", "--pretty", "false", "--project", "tsconfig.json"],
        FRONTEND,
    )
    if code == 0:
        report.add("PASS", "typescript", "tsc --noEmit")
        return
    report.add("FAIL", "typescript", f"exit code {code}", output)


def check_django_tests(report: Reporter) -> None:
    code, output = run_python_stdin(TEST_GUARD, BACKEND)
    if code != 0 or "separate-test-database" not in output:
        report.add(
            "FAIL",
            "django tests",
            "tests were not started",
            output or "The test database guard failed.",
        )
        return
    code, output = manage(["test", "--noinput", f"--settings={TEST_SETTINGS}"])
    summary = [
        line
        for line in output.splitlines()
        if line.startswith("Ran ") or line.startswith("FAILED") or line.strip() == "OK"
    ]
    detail = "; ".join(summary) if summary else f"exit code {code}"
    if code == 0:
        report.add("PASS", "django tests", detail)
        return
    report.add("FAIL", "django tests", detail, output)


def check_frontend_build(report: Reporter) -> None:
    if shutil.which("npm") is None:
        report.add("FAIL", "frontend build", "npm was not found on PATH. Packages were not installed.")
        return
    # On Windows, cmd.exe runs npm.cmd from PATH. Quoting the full npm path
    # makes cmd look up a broken path, so the command stays a fixed string.
    if os.name == "nt":
        code, output = run_command("npm run build", FRONTEND, shell=True)
    else:
        code, output = run_command(["npm", "run", "build"], FRONTEND)
    if code == 0:
        report.add("PASS", "frontend build", "npm run build", output, show_output=True)
        return
    report.add("FAIL", "frontend build", f"exit code {code}", output)


def run_checks(report: Reporter, *, full: bool) -> None:
    check_staged_secrets(report)
    check_python_syntax(report)
    report.add("SKIP", "python lint", "Ruff, Flake8, and pylint are not installed")
    check_django(
        report,
        "django check",
        ["check", "--fail-level", "ERROR", f"--settings={LOCAL_SETTINGS}"],
        "config.settings.local",
    )
    check_django(
        report,
        "migration consistency",
        ["makemigrations", "--check", "--dry-run", "--noinput", f"--settings={LOCAL_SETTINGS}"],
        "makemigrations --check --dry-run",
    )
    db_code, db_output = run_python_stdin(DB_PROBE, BACKEND)
    database_ok = db_code == 0
    if database_ok:
        report.add("PASS", "database connection", "development database accepted a connection")
    else:
        report.add("FAIL", "database connection", "could not connect", db_output)
    check_pending_migrations(report, database_ok)
    check_typescript(report)
    report.add("SKIP", "frontend lint", "frontend/package.json has no lint script")
    report.add("SKIP", "frontend format", "Prettier is not configured")
    report.add("SKIP", "frontend tests", "no frontend test runner is configured")
    if full:
        check_django_tests(report)
        check_frontend_build(report)
    else:
        report.add("SKIP", "django tests", "not selected; pass --full to run")
        report.add("SKIP", "frontend build", "not selected; pass --full to run")


def install_hook() -> int:
    git_entry = ROOT / ".git"
    if not git_entry.exists():
        print(
            "This directory is not a Git repository. Initialize Git yourself, then run --install-hook again.",
            file=sys.stderr,
        )
        return 1
    if not git_entry.is_dir():
        print(
            "A .git file was found, but the hook installer only writes .git/hooks inside a normal repository.",
            file=sys.stderr,
        )
        return 1
    hooks = git_entry / "hooks"
    hooks.mkdir(exist_ok=True)
    hook = hooks / "pre-commit"
    if hook.exists():
        existing = hook.read_text(encoding="utf-8", errors="replace")
        if HOOK_MARKER not in existing:
            print(f"{hook} already exists and was left unchanged.", file=sys.stderr)
            return 1
    hook.write_text(HOOK_SCRIPT, encoding="utf-8", newline="\n")
    print("Installed .git/hooks/pre-commit")
    print("The hook runs the fast checks and rejects the commit when a mandatory check fails.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Pulse validation checks before a commit.")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Also run the Django test suite and the frontend production build.",
    )
    parser.add_argument(
        "--install-hook",
        action="store_true",
        help="Install the Git pre-commit hook when a repository already exists.",
    )
    args = parser.parse_args(argv)
    if args.install_hook:
        if args.full:
            print("--install-hook does not run validation checks.", file=sys.stderr)
        return install_hook()

    report = Reporter()
    run_checks(report, full=args.full)
    passed = report.rows.count("PASS")
    skipped = report.rows.count("SKIP")
    _safe_print(f"\nResult: {passed} passed, {report.failed} failed, {skipped} skipped")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
