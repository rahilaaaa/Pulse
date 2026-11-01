awssss.work@gmail.com
abdulmashood3211@gmail.com
rahilamk07@gmail.com
reviewcartdeals@gmail.com
shanamashood5@gmail.com
mkrahila117@gmail.com


rahilamk07@gmail.com-used rahi*78
abdulmashood3211@gmail.com-used pass khana*776655


seed Datas 
Email: suresh.patil@aetherprecision.example
Password: a-long-passphrase


Other seeded logins (same password)
These also have memberships (same default password):

Email	Role
anita.kulkarni@aetherprecision.example
Department Manager

neha.joshi@aetherprecision.example
HR Manager

murugan.selvam@aetherprecision.example
Department Manager

lakshmi.narayanan@aetherprecision.example
Employee

vikas.mane@aetherprecision.example
Employee

arun.kumar@aetherprecision.example
Employee (temporary)




seed command 
.\.venv\Scripts\python.exe backend\manage.py seed_demo_manufacturing --reset


create admin command 
.\.venv\Scripts\python.exe backend\manage.py create_platform_admin --email operator@example.com


(.venv) D:\Programs\Pulse\backend>python manage.py seed_demo_manufacturing --reset
Catalogs/plans ready.
Removed company slug=aether-precision.
Removed company slug=demo-isolation-co.
Custom field definitions created.
Unit types created.
Organization units: 13
People: 18
Memberships with roles: 7
Invitations: 5 (tokens not emailed; demo only)
Custom entities: 8
Seeded company Aether Precision id=ed5eea57-2581-4360-89fc-804f83ed8209
Owner login: suresh.patil@aetherprecision.example / (password you passed, default a-long-passphrase)
--- Demo ID → UUID map (sample) ---
CO-MFG-001 → ed5eea57-2581-4360-89fc-804f83ed8209
EMP-M-001 → 1aed9e82-012e-4453-85f0-f51c0e0595e9
EMP-M-002 → 6248117b-6056-4adf-b22f-d5773210edc9
EMP-M-003 → 83d2b079-cf02-4e31-9f0a-f26dd210ae97
EMP-M-004 → b93cfdc5-e74f-4e42-99ee-879f5558ccd3
EMP-M-005 → 0868b4fb-7780-4f46-bbbb-7b7411386fbe
... (18 people total)
OU-MFG-CORP → 28b3301e-a4a6-4925-ae3d-e4d1291dc8a0
OU-MFG-HR → 7279ab74-1b71-47e3-85c9-5bd49c3403f0
OU-MFG-FIN → 321c7ebe-e0b5-4764-b85e-1d21f544faef
OU-MFG-QA-C → 62b04376-9920-44b4-83b8-bd6b72dd0d67
OU-MFG-PUN → dbb83e53-bc15-428c-b640-0622e2445932
... (13 units total)
entity:company-assets → 7d86254b-344a-4ebe-bcf5-e6f94c31acf9
entity:vendors → 696e45b8-55ab-425b-91ba-764ebe1c22f7
entity:contracts → 7d7a1802-d1d5-4d5d-821d-0ab31c7fdee4
entity:office-locations → 9466396d-2ec4-4ea7-849a-46d395b325bc
entity:production-lines → 3605ba60-facd-4ffc-a91b-a81c2118e625
entity:machines-and-equipment → bae4200d-a7ac-44e0-81bf-256978e45de8
entity:quality-inspections → a5b6ea31-2d97-48d7-b8a5-6475806872b2
entity:supplier-deliveries → 82e3e5c4-f181-4901-8715-7a38c109234b
--- §J verification ---
People custom_data shift=Shift B → 2 (Priya Rajendran, Vikas Mane)
Filter machines maintenance-status=Due → 1 (expect 1)
Filter quality-inspections result=Fail → 1 (expect 1)
Isolation: Aether people absent from isolation company queryset
Isolation: Aether people=18, isolation people=1
Isolation: foreign entity under other company → not_found
Isolation: Aether machine records=3, isolation records=0
Counts: people=18 units=13 invites=5 entities=8 records=23

