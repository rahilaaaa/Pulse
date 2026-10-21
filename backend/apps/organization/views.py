from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import effective_permission_codes, require_permission
from apps.organization.models import OrganizationUnitType
from apps.organization.services import (
    _type_payload,
    _unit_payload,
    assign_members,
    create_person,
    create_unit,
    list_organization,
    list_people,
    person_directory_row,
    save_unit_type,
    unit_detail,
    update_unit,
)
from common.api.errors import not_found


def _company(request, company_id, code):
    membership = require_permission(request.user, company_id, code)
    return membership.company, "people.view" in effective_permission_codes(membership)


class UnitTypeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, _include_people = _company(request, company_id, "departments.view")
        rows = OrganizationUnitType.objects.filter(company=company)
        return Response({"results": [_type_payload(row) for row in rows]})

    def post(self, request, company_id):
        company, _include_people = _company(request, company_id, "departments.manage")
        return Response(_type_payload(save_unit_type(request, company, request.data)), status=201)


class UnitTypeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, type_id):
        company, _include_people = _company(request, company_id, "departments.manage")
        row = OrganizationUnitType.objects.filter(company=company, pk=type_id).first()
        if row is None:
            raise not_found("That unit type was not found.")
        return Response(_type_payload(save_unit_type(request, company, request.data, row)))


class UnitListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, include_people = _company(request, company_id, "departments.view")
        return Response(list_organization(company, include_people))

    def post(self, request, company_id):
        company, _include_people = _company(request, company_id, "departments.manage")
        return Response(_unit_payload(create_unit(request, company, request.data)), status=201)


class UnitDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, unit_id):
        company, include_people = _company(request, company_id, "departments.view")
        return Response(unit_detail(company, unit_id, include_people))

    def patch(self, request, company_id, unit_id):
        company, _include_people = _company(request, company_id, "departments.manage")
        return Response(_unit_payload(update_unit(request, company, unit_id, request.data)))


class UnitMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, company_id, unit_id):
        company, include_people = _company(request, company_id, "departments.manage")
        assign_members(request, company, unit_id, request.data.get("person_ids"))
        return Response(unit_detail(company, unit_id, include_people))


class PersonListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        company, _include_people = _company(request, company_id, "people.view")
        return Response({"results": list_people(company)})

    def post(self, request, company_id):
        company, _include_people = _company(request, company_id, "people.create")
        person = create_person(request, company, request.data)
        return Response(person_directory_row(company, person), status=201)
