import { AuthCard, AuthFrame } from "../../shared/ui/AuthFrame";

const notices = {
  privacy: {
    title: "Privacy",
    paragraphs: [
      "Pulse stores the account, company, and billing details you submit so a workspace can be created and administered.",
      "Passwords are stored as hashes. Email verification links are sent to the address you register.",
      "Billing details, including an optional GSTIN, are kept with the company that owns them.",
    ],
  },
  terms: {
    title: "Terms",
    paragraphs: [
      "Each company gets its own workspace. You are responsible for the company and billing details you enter.",
      "Choosing a plan with a trial creates a subscription record. The trial does not capture a payment.",
      "Platform operator access is separate from company administration.",
    ],
  },
  security: {
    title: "Security",
    paragraphs: [
      "Company accounts and platform operators sign in with email and password. Passwords must be at least 6 characters.",
      "Email verification is required before creating a company or accepting invitations.",
      "The session is kept in an HTTP-only cookie on this site.",
    ],
  },
} as const;

export function NoticePage({ kind }: { kind: keyof typeof notices }) {
  const notice = notices[kind];
  return (
    <AuthFrame>
      <AuthCard title={notice.title}>
        <div className="space-y-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          {notice.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </AuthCard>
    </AuthFrame>
  );
}
