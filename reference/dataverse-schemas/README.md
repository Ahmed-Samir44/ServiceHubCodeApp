# Dataverse table schemas (reference only)

Schemas of the ServiceHub tables in the **data org** (`https://org319b4ea9.crm4.dynamics.com`),
fetched with `pa app add data-source --connector dataverse --table <name> --org-url <data org>`
in a scratch copy of the project. They are ground truth for display names, entity sets,
primary id/name and column types. They are **not** used at runtime.

The app itself reads data cross-environment through the generic Dataverse connector
(`*WithOrganization` operations), because per-table data sources always target the app's
home environment.

To refresh one: run the command above in a throwaway folder that contains a copy of
`power.config.json`, then copy `.power/schemas/dataverse/<name>.Schema.json` here.
