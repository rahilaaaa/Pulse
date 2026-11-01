from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import effective_permission_codes, require_permission
from apps.organization.models import OrganizationUnitType
from apps.organization.models import PersonStatus
from apps.organization.services import (
    _type_payload,
    _unit_payload,
    assign_members,
    create_person,
    create_unit,
    delete_unit,
    ensure_default_unit_types,
    list_organization,
    list_people,
    person_directory_row,
    save_unit_type,
    set_person_status,
    unit_detail,
    update_person,
    update_unit,
)
from common.api.errors import not_found, validation_error


def _company(request, company_id, code):
    membership = require_permission(request.user, company_id, code)
    codes = effective_permission_codes(membership)
    return membership.company, membership, codes, "people.view" in codes


class UnitTypeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, _membership, _codes, _include_people = _company(request, company_id, "departments.view")
        ensure_default_unit_types(company)
        rows = OrganizationUnitType.objects.filter(company=company)
        return Response({"results": [_type_payload(row) for row in rows]})

    def post(self, request, company_id):
        company, _membership, _codes, _include_people = _company(request, company_id, "departments.manage")
        return Response(_type_payload(save_unit_type(request, company, request.data)), status=201)


class UnitTypeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, type_id):
        company, _membership, _codes, _include_people = _company(request, company_id, "departments.manage")
        row = OrganizationUnitType.objects.filter(company=company, pk=type_id).first()
        if row is None:
            raise not_found("That unit type was not found.")
        return Response(_type_payload(save_unit_type(request, company, request.data, row)))


class UnitListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, membership, codes, include_people = _company(request, company_id, "departments.view")
        payload = list_organization(company, include_people)
        for row in payload.get("results", []):
            raw = dict(row.get("custom_data") or {})
            from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
            from apps.tenants.models import FieldEntity

            row["custom_data"] = serialize_custom_data(
                load_active_definitions(company, FieldEntity.ORGANIZATION_UNIT),
                raw,
                entity=FieldEntity.ORGANIZATION_UNIT,
                permission_codes=codes,
            )
        return Response(payload)

    def post(self, request, company_id):
        company, membership, codes, _include_people = _company(request, company_id, "departments.manage")
        return Response(_unit_payload(create_unit(request, company, request.data), permission_codes=codes), status=201)


class UnitDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, unit_id):
        company, membership, codes, include_people = _company(request, company_id, "departments.view")
        payload = unit_detail(company, unit_id, include_people)
        from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
        from apps.tenants.models import FieldEntity

        payload["custom_data"] = serialize_custom_data(
            load_active_definitions(company, FieldEntity.ORGANIZATION_UNIT),
            payload.get("custom_data") or {},
            entity=FieldEntity.ORGANIZATION_UNIT,
            permission_codes=codes,
        )
        return Response(payload)

    def patch(self, request, company_id, unit_id):
        company, membership, codes, _include_people = _company(request, company_id, "departments.manage")
        return Response(_unit_payload(update_unit(request, company, unit_id, request.data), permission_codes=codes))

    def delete(self, request, company_id, unit_id):
        company, membership, codes, _include_people = _company(request, company_id, "departments.manage")
        row = delete_unit(request, company, unit_id)
        return Response(_unit_payload(row, permission_codes=codes))


class UnitMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, company_id, unit_id):
        company, membership, codes, include_people = _company(request, company_id, "departments.manage")
        assign_members(request, company, unit_id, request.data.get("person_ids"))
        payload = unit_detail(company, unit_id, include_people)
        from apps.tenants.custom_data_access import load_active_definitions, serialize_custom_data
        from apps.tenants.models import FieldEntity

        payload["custom_data"] = serialize_custom_data(
            load_active_definitions(company, FieldEntity.ORGANIZATION_UNIT),
            payload.get("custom_data") or {},
            entity=FieldEntity.ORGANIZATION_UNIT,
            permission_codes=codes,
        )
        return Response(payload)


class PersonListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, membership, codes, _include_people = _company(request, company_id, "people.view")
        status = request.query_params.get("status") or PersonStatus.ACTIVE
        if status not in {PersonStatus.ACTIVE, PersonStatus.INACTIVE, "all"}:
            raise validation_error([{"field": "status", "code": "invalid", "message": "Choose active, inactive, or all."}])
        return Response(
            {
                "results": list_people(
                    company,
                    status=status,
                    permission_codes=codes,
                    viewer_person_id=membership.person_id,
                )
            }
        )

    def post(self, request, company_id):
        company, membership, codes, _include_people = _company(request, company_id, "people.create")
        person = create_person(request, company, request.data)
        return Response(
            person_directory_row(
                company,
                person,
                permission_codes=codes,
                viewer_person_id=membership.person_id,
            ),
            status=201,
        )


class PersonDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, person_id):
        # people.update OR self-edit of custom_data (enforced in update_person)
        membership = require_permission(request.user, company_id, "people.view")
        codes = effective_permission_codes(membership)
        if "people.update" not in codes:
            # Allow self path only — update_person will raise if not self / not allowed keys
            pass
        company = membership.company
        person = update_person(request, company, person_id, request.data)
        return Response(
            person_directory_row(
                company,
                person,
                permission_codes=codes,
                viewer_person_id=membership.person_id,
            )
        )


class PersonStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, person_id):
        # Status changes require people.update (activate/deactivate). people.deactivate alone is not used here.
        company, membership, codes, _include_people = _company(request, company_id, "people.update")
        status = request.data.get("status")
        if not isinstance(status, str):
            raise validation_error([{"field": "status", "code": "invalid", "message": "Choose active or inactive."}])
        person = set_person_status(request, company, person_id, status)
        return Response(
            person_directory_row(
                company,
                person,
                permission_codes=codes,
                viewer_person_id=membership.person_id,
            )
        )
