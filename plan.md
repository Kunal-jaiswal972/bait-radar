# BaitRadar — Plan (remaining work)

## What it is

A serverless, event-driven pipeline on **Azure Functions** that watches YouTube
channels, ingests each new upload (metadata / comments / transcript), runs **AI
clickbait + sentiment analysis** (Azure Vision + Gemini + Azure Language),
persists insights to **Cosmos DB**, tracks engagement over time, and serves it to
a **React SPA**. Deployed as Terraform in `infra/` to the `BaitRadar` resource
group; a Node Function App (public via APIM) + an internal Python transcript app.

> Architecture, data model, the 3-pillar clickbait model, and deploy steps are
> documented in [`README.md`](README.md) and [`DEPLOYMENT.md`](DEPLOYMENT.md).
> Shipped: ingestion pipeline, clickbait v2, dashboard + read API, full Azure
> deployment, and the hourly time-series tracker.

## Remaining work

### Transcripts in production
YouTube blocks the transcript scraper from Azure datacenter IPs
(`RequestBlocked`), so in prod the transcript + promise–payoff-mismatch pillar are
`unavailable` (the pipeline degrades gracefully; everything else works). To enable:
- **Residential proxy** (recommended) — `youtube-transcript-api` native proxy
  config (e.g. Webshare); add a `TRANSCRIPT_PROXY` setting to the Python app.
- **or PoToken via BotGuard** (`bgutils-js` in a Node path) — what free transcript
  sites do; fragile, needs upkeep, may still be IP-flagged.
- **or audio → Azure AI Speech (Whisper).** Download the video, strip audio and run
  speech-to-text instead of scraping captions. Sidesteps the caption endpoint, but
  the audio pull (yt-dlp) hits the *same* YouTube IP block from Azure and adds
  STT cost + latency — so it still needs a proxy to fetch the audio.
- **YouTube Data API captions — not an option.** `captions.download` only works for
  videos **you own** (creator OAuth); it can't fetch third-party channels' captions.

Bottom line: a **residential proxy is the only low-maintenance fix**. Transcripts
work fine locally (residential IP).


### Optional polish
- **APIM rate-limiting** — omitted (unsupported on the Consumption tier); add if
  moving to a paid APIM tier.


Node app — (ships `dist/` + `node_modules/`; deps installed fresh, not committed). - we can migrate to npm in prod and bun in dev so that node modules does not need to be shipped everytime takes a lot of bandwidth



Skip to main contentSkip to Ask Learn chat experience
Learn
Sign in
Azure
Search
Find by title
Functions Documentation
Scalable web API
Respond to blob storage events
Serverless agents
Run scheduled tasks
Process real-time events
Migrate Linux apps to Flex Consumption using Copilot
Migrate from AWS Lambda
Migrate Consumption plan apps to Flex Consumption
Migrate .NET apps to the isolated model
LearnAzureFunctions
Migrate Consumption plan apps to the Flex Consumption plan

Summarize this article for me
Choose a hosting platform
This article shows you how to migrate your existing function apps from the Consumption plan to the Flex Consumption plan. For most apps, this migration is straightforward and your code doesn't need to change.

 Important

Support for hosting function apps on Linux in a Consumption plan retires on September 30, 2028. As of today, feature and language enhancements aren't being made to the Linux Consumption plan. Follow this article to migrate your Consumption plan apps to instead run in the Flex Consumption plan. To learn more about Linux Consumption plan end-of-support dates, see Azure Functions Consumption plan hosting (legacy).

Migration methods
This article supports migrating to a Linux function app in a Flex Consumption plan for both Linux and Windows apps. Functions provides several ways to streamline most of the migration steps, particularly for Linux apps.

The following table shows which migration methods are available for each operating system and are covered in this article.

Migration method	Description	Linux	Windows
Azure Skills in GitHub Copilot.	Let Copilot guide and automate your migration interactively (recommended for Linux).	✅	❌
CLI migration command	Use az functionapp flex-migration to automate migration.	✅	❌
Standard CLI commands	Stepwise migration using Azure CLI commands.	➖	✅
Azure portal	Stepwise migration in the Azure portal.	✅	✅
Infrastructure as code	Create repeatable migration code using ARM templates, Bicep files, or Terraform.	➖	➖
✅ Supported and featured  |  ➖ Supported, not featured  |  ❌ Not supported

To see the right instructions for your app, select your operating system at the top of the article.

What to expect
The specific steps required to migrate your Consumption plan app depends on both the operating system and your specific migration method:

GitHub Copilot
Azure CLI
Azure portal
The flex-migration CLI commands automate app creation and configuration. Your high-level steps are:

Identify potential apps to migrate
Assess your existing app
Review dependent services
Start the migration
Get the code deployment package
Complete migration steps
Post-migration tasks
Regardless of your migration method, here are the general principles of the migration:

Your code stays the same. You don't need to rewrite your functions if you're on a Flex Consumption supported language version. This guide helps you check.
You must create a new app. The migration process creates a new Flex Consumption app alongside your existing one, so you can test before switching over.
Use the same resource group. Your new app runs in the same resource group with access to the same dependencies.
You control the timing. Test your new app thoroughly before redirecting traffic and retiring the old one.
 Note

If you're using Azure Government, Flex Consumption isn't available there yet. Review this guidance now so you're ready when it becomes available.

Benefits of migrating to Flex Consumption
When you migrate, your functions get these benefits without changing your code:

Faster cold starts: Always-ready instances mean your functions respond more quickly.
Better scaling: Per-function scaling and concurrency controls give you more control.
Virtual network support: Connect your functions to private networks and use private endpoints.
Active investment: Flex Consumption is where new features and improvements land first.
For more information, see Flex Consumption plan benefits and hosting plan comparison.

Resource-based deployments
This article doesn't explicitly show how to use infrastructure-as-code (IaC) for migration. However, you can follow the same migration steps to convert your ARM templates, Bicep files, and Terraform configurations.

The Flex Consumption plan introduces a new functionAppConfig section in the Microsoft.Web/sites resource definition, which replaces several legacy app settings. For details on these changes, see Flex Consumption plan deprecations.

These resources can help you get started with Flex Consumption resource deployments:

Automate resource deployment covers the full resource configuration details.
Ready-to-use examples are available for ARM templates, Bicep, and Terraform.
After a successful migration, update your resource deployment files to match the new Flex Consumption configuration.

Prerequisites
Access to the Azure subscription containing one or more function apps to migrate. The account used to perform the migration tasks must have the following permissions:

Create and manage function apps and App Service hosting plans.
Assign roles to managed identities.
Create and manage storage accounts.
Create and manage Application Insights resources.
Access all dependent resources of your app, such as Azure Key Vault, Azure Service Bus, or Azure Event Hubs.
Assigning the Owner or Contributor roles in your resource group generally provides sufficient permissions.

To migrate using the Azure CLI or GitHub Copilot:

Azure CLI, version 2.77.0 or later. Required when using Azure CLI commands. The scripts are tested by using Azure CLI in Azure Cloud Shell.
Sign in to Azure CLI by running az login. Make sure you're signed in to the subscription that contains the function apps you want to migrate.
To migrate using GitHub Copilot, configure GitHub Copilot in your desired mode:

GitHub Copilot CLI
Visual Studio Code
Install Copilot CLI

Sign in to Azure CLI if you haven't already:

Azure CLI
az login
Make sure you're signed in to the subscription that contains the function apps you want to migrate.

Launch the Copilot CLI:

copilot
Add the marketplace source (first time only):

/plugin marketplace add microsoft/azure-skills
Install the plugin:

/plugin install azure@azure-skills
After install, reload Model Context Protocol (MCP) servers:

/mcp reload
Verify installation:

/mcp show
You should see the azure plugin listed with a checkmark. The functionapp tool is part of this plugin.

 Tip

If Copilot targets the wrong subscription, ask it to use a specific subscription ID. You can find your subscription ID by running az account show --query id -o tsv. If Copilot connects to the wrong Azure tenant, ask Copilot to use your specific tenant ID when making Azure calls. You can find your tenant ID by running az account show --query tenantId -o tsv.

Identify potential apps to migrate
 Tip

Already know which app to migrate? You can skip this section and go straight to Assess your existing app.

If you have multiple function apps and aren't sure which ones need to migrate, this section helps you find them. You get a list of app names, resource groups, locations, and runtime stacks.

GitHub Copilot
Azure CLI
Azure portal
Run this command to see which of your Linux Consumption apps are ready to migrate:

Azure CLI
az functionapp flex-migration list
This command automatically scans your subscription and returns two arrays:

eligible_apps: Linux Consumption apps that can be migrated to Flex Consumption. These apps are compatible with Flex Consumption.
ineligible_apps: Apps that can't be migrated, along with the specific reasons why. Review and address the reasons for incompatibility before continuing.
 Note

This command only evaluates function apps running on the Linux Consumption plan. Apps running on other hosting plans (Windows Consumption, Premium, Dedicated, or Flex Consumption) don't appear in either the eligible_apps or ineligible_apps arrays. If you have many function apps and aren't sure which hosting plan each one uses, run az functionapp list --query "[].{name:name, sku:sku}" -o table to see all apps and their SKUs, where Dynamic indicates a Consumption plan app.

The output includes the app name, resource group, location, and runtime stack for each app, along with eligibility status and migration readiness information.

Assess your existing app
The Azure skill perform these tasks for you automatically. When using the Azure skill, go directly to Start the migration.

Before migrating, run through this quick checklist to make sure your app is ready. Most apps pass these checks without problems:

Confirm region compatibility
Verify language stack compatibility
Verify stack version compatibility
Verify deployment slots usage
Verify the use of certificates
Verify your Blob storage triggers
Confirm region compatibility
Confirm that the Flex Consumption plan is currently supported in the same region as the Consumption plan app you intend to migrate.

Confirmed: When the az functionapp flex-migration list command output or Copilot assessment includes your app in the eligible_apps list, the Flex Consumption plan is supported in the same region used by your current Linux Consumption app. In this case, you can continue to Verify language stack compatibility.

Action required: When the output includes your app in the ineligible_apps list, you see an error message stating The site '<name>' is not in a region supported in Flex Consumption. Please see the list of regions supported in Flex Consumption by running az functionapp list-flexconsumption-locations. In this case, the Flex Consumption plan isn't supported in the region used by your current Linux Consumption app.

If your region isn't currently supported and you still choose to migrate your function app, your app must run in a different region where the Flex Consumption plan is supported. However, running your app in a different region from other connected services can introduce extra latency. Make sure that the new region can meet your application's performance requirements before you complete the migration.

Verify language stack compatibility
Flex Consumption plans don't support all Functions language stacks. This table indicates which language stacks are currently supported:

Stack setting	Stack name	Supported
dotnet-isolated	.NET (isolated worker model)	✅ Yes
node	JavaScript/TypeScript	✅ Yes
java	Java	✅ Yes
python	Python	✅ Yes
powershell	PowerShell	✅ Yes
go	Go (Preview)	✅ Yes
dotnet	.NET (in-process model)	❌ No
custom	Custom handlers	✅ Yes
Confirmed: If the az functionapp flex-migration list command or Copilot assessment included your app in the eligible_apps list, your Linux Consumption app is already using a supported language stack by Flex Consumption and you can continue to Verify stack version compatibility.

Action required: If the output included your app in the ineligible_apps list with an error message stating Runtime '<name>' not supported for function apps on the Flex Consumption plan., your Linux Consumption app isn't running a supported runtime by Flex Consumption.

If your function app uses an unsupported runtime stack:

For C# apps that run in-process with the runtime (dotnet), you must first migrate your app to .NET isolated. For more information, see Migrate C# apps from the in-process model to the isolated worker model.
Verify stack version compatibility
Before migrating, make sure that your app's runtime stack version is supported when running in a Flex Consumption plan in the current region.

Confirmed: If the az functionapp flex-migration list command or Copilot assessment includes your app in the eligible_apps list, your Linux Consumption app is already using a supported language stack version by Flex Consumption and you can continue to Verify deployment slots usage.

Action required: If the output includes your app in the ineligible_apps list with an error message stating Invalid version {0} for runtime {1} for function apps on the Flex Consumption plan. Supported versions for runtime {1} are {2}., your Linux Consumption app isn't running a supported runtime by Flex Consumption.

If your function app uses an unsupported language stack version, first upgrade your app code to a supported version before migrating to the Flex Consumption plan.

Verify deployment slots usage
Consumption plan apps can have a deployment slot defined. For more information, see Azure Functions deployment slots. However, the Flex Consumption plan doesn't currently support deployment slots. Before you migrate, determine if your app has a deployment slot. If it does, define a strategy for how to manage your app without deployment slots when running in a Flex Consumption plan.

Confirmed: When your current app has deployment slots enabled, the az functionapp flex-migration list command or Copilot assessment shows your function app in the eligible_apps list without a warning. Continue to Verify the use of certificates.

Action required: Your current app has deployment slots enabled, and the output shows your function app in the eligible_apps list but adds a warning that states: The site '<name>' has slots configured. This condition doesn't block migration, but please note that slots aren't supported in Flex Consumption.

If your function app is currently using deployment slots, you can't currently reproduce this functionality in the Flex Consumption plan. Before migrating, consider the following options:

Rearchitect your application to use separate function apps. In this way, you can develop, test, and deploy your function code to a second nonproduction app instead of using slots.
Migrate any new code or features from the deployment slot into the main (production) slot.
Verify the use of certificates
The Flex Consumption plan supports TLS/SSL certificates through a site-scoped certificate model, currently in preview. Unlike other hosting plans where certificates are shared across apps in the same region and resource group, Flex Consumption certificates are scoped to each individual app. If your existing app uses certificates, be aware of these differences:

The WEBSITE_LOAD_CERTIFICATES app setting isn't used in the Flex Consumption plan. Instead, you make each certificate accessible to your code by using the Accessible to app code toggle in the portal. For more information, see Make a certificate accessible to your code.
Because Flex Consumption runs on Linux, your code must load certificates from file paths (/var/ssl/certs for public, /var/ssl/private for private) rather than from the Windows certificate store.
Each app supports a maximum of three private certificates and three public certificates (.cer).
Confirmed: If the az functionapp flex-migration list command or Copilot assessment includes your app in the eligible_apps list, your Linux Consumption app is compatible and you can continue to Verify your Blob storage triggers. If your app uses certificates, you need to add them to the new app after migration.

Action required: If the output includes your app in the ineligible_apps list with a certificate-related error, review the site-scoped certificate considerations and verify your app can work within the certificate limits.

If your app uses certificates, plan to re-add them to the new Flex Consumption app after migration using the site-scoped certificate process. Make sure your app's certificate needs fit within the site-scoped limits (3 private + 3 public per app).

Verify your Blob storage triggers
Currently, the Flex Consumption plan only supports event-based triggers for Azure Blob storage, which are defined with a Source setting of EventGrid. The plan doesn't support Blob storage triggers that use container polling and use a Source setting of LogsAndContainerScan. Because container polling is the default, you must determine if any of your Blob storage triggers use the default LogsAndContainerScan source setting. For more information, see Trigger on a blob container.

Confirmed: If the az functionapp flex-migration list command or Copilot assessment includes your app in the eligible_apps list, your Linux Consumption app isn't using Blob storage triggers with EventGrid as the source. You can continue to Consider dependent services.

Action required: If the output includes your app in the ineligible_apps list with an error message stating The site '<name>' has blob storage triggers that don't use Event Grid as the source: <list> Flex Consumption only supports Event Grid-based blob triggers. Please convert these triggers to use Event Grid or replace them with Event Grid triggers before migration., your Linux Consumption app isn't compatible with Flex Consumption.

If your app has any Blob storage triggers that don't have an Event Grid source, you must change to an Event Grid source before you migrate to the Flex Consumption plan.

The basic steps to change an existing Blob storage trigger to an Event Grid source are:

Add or update the source property in your Blob storage trigger definition to EventGrid and redeploy the app.

Build the endpoint URL in your function app used to be used by the event subscription.

Create an event subscription on your Blob storage container.

For more information, see Tutorial: Trigger Azure Functions on blob containers using an event subscription.

Consider dependent services
 Tip

Simple HTTP-only app? If your functions only use HTTP triggers and don't connect to other Azure services, you can likely skip most of this section. Just remember to update any clients to point to your new app's URL after migration.

Because Azure Functions is a compute service, consider the effect of migration on data and services both upstream and downstream of your app.

Data protection strategies
To protect both upstream and downstream data during the migration, use these strategies:

Idempotency: Ensure your functions can safely process the same message multiple times without negative side effects. For more information, see Designing Azure Functions for identical input.
Logging and monitoring: To track message processing, enable detailed logging in both apps during migration. For more information, see Monitor executions in Azure Functions.
Checkpointing: For streaming triggers, such as the Event Hubs trigger, implement correct checkpoint behaviors to track processing position. For more information, see Azure Functions reliable event processing.
Parallel processing: Consider temporarily running both apps in parallel during the cutover. Make sure to carefully monitor and validate how data is processed from the upstream service. For more information, see Custom multi-region solutions for resiliency.
Gradual cutover: For high-volume systems, consider implementing a gradual cutover by redirecting portions of traffic to the new app. You can manage the routing of requests upstream from your apps by using services such as Azure API Management or Azure Application Gateway.
Mitigations by trigger type
Plan mitigation strategies to protect data for the specific function triggers in your app:

Trigger	Risk to data	Strategy
Azure Blob storage	High	Create a separate container for the event-based trigger in the new app.
With the new app running, switch clients to use the new container.
Allow the original container to be processed completely before stopping the old app.
Azure Cosmos DB	High	Create a dedicated lease container specifically for the new app.
Set this new lease container as the leaseCollectionName configuration in your new app.
Requires that your functions be idempotent or you must be able to handle the results of duplicate change feed processing.
Set the StartFromBeginning configuration to false in the new app to avoid reprocessing the entire feed.
Azure Event Grid	Medium	Recreate the same event subscription in the new app.
Requires that your functions be idempotent or you must be able to handle the results of duplicate event processing.
Azure Event Hubs	Medium	Create a new consumer group for use by the new app. For more information, see Migration strategies for Event Grid triggers.
Azure Service Bus	High	Create a new topic or queue for use by the new app.
Update senders and clients to use the new topic or queue.
After the original topic is empty, shut down the old app.
Azure Storage queue	High	Create a new queue for use by the new app.
Update senders and clients to use the new queue.
After the original queue is empty, shut down the old app.
HTTP	Low	Remember to switch clients and other apps or services to target the new HTTP endpoints after the migration.
Timer	Low	During cutover, make sure to offset the timer schedule between the two apps to avoid simultaneous executions from both apps.
Disable the timer trigger in the old app after the new app runs successfully.
Start the migration
GitHub Copilot
Azure CLI
Azure portal
The az functionapp flex-migration start command collects your app's configuration and creates a new Flex Consumption app with the same settings.

Azure CLI
az functionapp flex-migration start \
    --source-name <SOURCE_APP_NAME> \
    --source-resource-group <SOURCE_RESOURCE_GROUP> \
    --name <NEW_APP_NAME> \
    --resource-group <RESOURCE_GROUP>
In this example, replace these placeholders with the values for your scenario:

Placeholder	Value
<SOURCE_APP_NAME>	The name of your original app.
<SOURCE_RESOURCE_GROUP>	The resource group of the original app.
<NEW_APP_NAME>	The name of the new app.
<RESOURCE_GROUP>	The resource group of the new app.
The az functionapp flex-migration start command performs these basic tasks:

Assesses your source app for compatibility with the Flex Consumption hosting plan.
Creates a function app in the Flex Consumption plan.
Migrates most configurations, including app settings, identity assignments, storage mounts, CORS settings, custom domains, and access restrictions.
The migration command supports several options to customize the migration:

Option	Description
--storage-account	Specify a different storage account for the new app
--maximum-instance-count	Set the maximum number of instances for scaling
--skip-access-restrictions	Skip migrating IP access restrictions
--skip-cors	Skip migrating CORS settings
--skip-hostnames	Skip migrating custom domains
--skip-managed-identities	Skip migrating managed identity configurations
--skip-storage-mount	Skip migrating storage mount configurations
For complete command options, use az functionapp flex-migration start --help.

After you successfully start the migration, continue to Get the code deployment package.

Get the code deployment package
To redeploy your app, you need either your project's source files or the deployment package. Ideally, you maintain your project files in source control so you can easily redeploy function code to your new app. If you have your source code files, you can skip this section and continue to Capture performance benchmarks (optional).

If you no longer have access to your project source files, you can download the current deployment package from the existing Consumption plan app in Azure. The location of the deployment package depends on whether you run on Linux or Windows.

Consumption plan apps on Linux maintain the deployment zip package file in one of these locations:

An Azure Blob storage container named scm-releases in the default host storage account (AzureWebJobsStorage). This container is the default deployment source for a Consumption plan app on Linux.

If your app has a WEBSITE_RUN_FROM_PACKAGE setting that is a URL, the package is in an externally accessible location that you maintain. An external package should be hosted in a blob storage container with restricted access. For more information, see External package URL.

 Tip

If you restrict your storage account to managed identity access only, you might need to grant your Azure account read access to the storage container by adding it to the Storage Blob Data Reader role.

The deployment package is compressed by using the squashfs format. To see what's inside the package, you must use tools that can decompress this format.

Use these steps to download the deployment package from your current app:

GitHub Copilot
Azure CLI
Azure portal
Use the az functionapp config appsettings list command to get the WEBSITE_RUN_FROM_PACKAGE app setting, if present:

Azure CLI
az functionapp config appsettings list --name <APP_NAME> --resource-group <RESOURCE_GROUP> \
    --query "[?name=='WEBSITE_RUN_FROM_PACKAGE'].value" -o tsv
In this example, replace <RESOURCE_GROUP> and <APP_NAME> with your resource group name and app name. If this command returns a URL, you can download the deployment package file from that remote location and skip to the next section.

If the WEBSITE_RUN_FROM_PACKAGE value is 1 or empty, use this script to get the deployment package for the existing app:

Azure CLI
appName=<APP_NAME>
rgName=<RESOURCE_GROUP>

echo "Getting the storage account connection string from app settings..."
storageConnection=$(az functionapp config appsettings list --name $appName --resource-group $rgName \
         --query "[?name=='AzureWebJobsStorage'].value" -o tsv)

echo "Getting the package name..."
packageName=$(az storage blob list --connection-string $storageConnection --container-name scm-releases \
--query "[0].name" -o tsv)

echo "Download the package? $packageName? (Y to proceed, any other key to exit)"
read -r answer
if [[ "$answer" == "Y" || "$answer" == "y" ]]; then
   echo "Proceeding with download..."
   az storage blob download --connection-string $storageConnection --container-name scm-releases \
--name $packageName --file $packageName
else
   echo "Exiting script."
   exit 0
fi
Again, replace <RESOURCE_GROUP> and <APP_NAME> with your resource group name and app name. The package .zip file is downloaded to the directory from which you executed the command.

Capture performance benchmarks (optional)
If you plan to validate performance improvement in your app based on the migration to the Flex Consumption plan, consider capturing the performance benchmarks of your current plan. Then, you can compare them to the same benchmarks for your app running in a Flex Consumption plan.

 Tip

Always compare performance under similar conditions, such as time of day, day of week, and client load. Try to run the two benchmarks as close together as possible.

Here are some benchmarks to consider for your structured performance testing:

Suggested benchmark	Comment
Cold-start	Measure the time from first request to the first response after an idle period.
Throughput	Measure the maximum requests per second using load testing tools to determine how the app handles concurrent requests.
Latency	Track the P50, P95, and P99 response times under various load conditions. You can monitor these metrics in Application Insights.
Use this Kusto query to review the suggested latency response times in Application Insights:

Kusto
requests
| where timestamp > ago(1d)
| summarize percentiles(duration, 50, 95, 99) by bin(timestamp, 1h)
| render timechart
Migration steps
To migrate your functions from a Consumption plan app to a Flex Consumption plan app, follow these main steps:

Verify Flex Consumption app created and configured
Configure built-in authentication
Deploy your app code to the new Flex Consumption resource
Verify Flex Consumption app created and configured
After running the az functionapp flex-migration start command, verify that your new Flex Consumption app is created successfully and properly configured. Here are some steps to validate the migration results:

GitHub Copilot
Azure CLI
Azure portal
Verify the new app exists and is running:

Azure CLI
az functionapp show --name <NEW_APP_NAME> --resource-group <RESOURCE_GROUP> \
     --query "{name:name, kind:kind, sku:properties.sku}" --output table
Review migrated app settings:

Azure CLI
az functionapp config appsettings list --name <NEW_APP_NAME> --resource-group <RESOURCE_GROUP> \
     --output table
Compare these settings with your source app to ensure critical configurations are transferred.

Check managed identity configuration:

Azure CLI
az functionapp identity show --name <NEW_APP_NAME> --resource-group <RESOURCE_GROUP>
Verify any custom domains were migrated:

Azure CLI
az functionapp config hostname list --webapp-name <NEW_APP_NAME> --resource-group <RESOURCE_GROUP> \
     --output table
Review migration summary
The automated migration command transfers most configurations. However, manually verify that these items are migrated. You might need to configure them manually:

Certificates: TLS/SSL certificates aren't supported in Flex Consumption yet.
Deployment slots: Not supported in Flex Consumption.
Built-in authentication settings: You need to reconfigure these settings manually.
CORS settings: You might need to verify these settings manually depending on your configuration.
If any critical settings are missing or incorrect, manually configure them by using the steps outlined in the Windows migration process sections of this article.

Configure built-in authentication
If your original app used built-in client authentication (sometimes called Easy Auth), recreate it in your new app. If you plan to reuse the same client registration, make sure to set the new app's authenticated endpoints in the authentication provider.

GitHub Copilot
Azure CLI
Azure portal
Based on the information you collected earlier, use the az webapp auth update command to recreate each built-in authentication registration required by your app.

Deploy your app code to the new Flex Consumption resource
After you configure your new Flex Consumption plan app based on the settings from the original app, deploy your code to the new app resources in Azure.

 Caution

After a successful deployment, triggers in your new app immediately start processing data from connected services. To minimize duplicated data and prevent data loss while starting the new app and shutting down the original app, review the strategies that you defined in mitigations by trigger type.

Functions provides several ways to deploy your code, either from the code project or as a ready-to-run deployment package.

 Tip

If you maintain your project code in a source code repository, now is the perfect time to configure a continuous deployment pipeline. Continuous deployment lets you automatically deploy application updates based on changes in a connected repository.

Continuous code deployment
Ad-hoc code deployment
Package deployment
Update your existing deployment workflows to deploy your source code to your new app:

Build and deploy using Azure Pipelines
Build and deploy using GitHub Actions
You can also create a new continuous deployment workflow for your new app. For more information, see Continuous deployment for Azure Functions.

Post-migration tasks
🎉 Congratulations! Your app is now running on Flex Consumption. To get the most out of your new plan, consider these optional follow-up tasks:

Verify basic functionality
Capture performance benchmarks
Create custom dashboards
Refine plan settings
Update your resource deployment files
Remove the original app (optional)
Verify basic functionality
Verify the new app is running in a Flex Consumption plan:

GitHub Copilot
Azure CLI
Azure portal
Use the az functionapp show command to view the details about the hosting plan:

Azure CLI
az functionapp show --name <APP_NAME> --resource-group <RESOURCE_GROUP> --query "serverFarmId"
In this example, replace <RESOURCE_GROUP> and <APP_NAME> with your resource group and function app names.

Use an HTTP client to call at least one HTTP trigger endpoint on your new app to make sure it responds as expected.

Capture performance benchmarks
With your new app running, run the same performance benchmarks that you collected from your original app, such as:

Suggested benchmark	Comment
Cold-start	Measure the time from first request to the first response after an idle period.
Throughput	Measure the maximum requests per second using load testing tools to determine how the app handles concurrent requests.
Latency	Track the P50, P95, and P99 response times under various load conditions. You can monitor these metrics in Application Insights.
Use this Kusto query to review the suggested latency response times in Application Insights:

Kusto
requests
| where timestamp > ago(1d)
| summarize percentiles(duration, 50, 95, 99) by bin(timestamp, 1h)
| render timechart
 Note

Flex Consumption plan metrics differ from Consumption plan metrics. When comparing performance before and after migration, keep in mind that you must use different metrics to track similar performance characteristics. For more information, see Configure monitoring.

Create custom dashboards
By using Azure Monitor metrics and Application Insights, you can create dashboards in the Azure portal that display charts from both platform metrics and runtime logs and analytics.

Consider setting up dashboards and alerts on your key metrics in the Azure portal. For more information, see Monitor your app in Azure.

Refine plan settings
Actual performance improvements and cost implications of the migration can vary based on your app-specific workloads and configuration. The Flex Consumption plan provides several settings that you can adjust to refine the performance of your app. You might want to make adjustments to more closely match the behavior of the original app or to balance cost versus performance. For more information, see Fine-tune your app in the Flex Consumption article.

Update your resource deployment files
If you manage your function app infrastructure by using Bicep or Terraform, update your deployment files to now target the Flex Consumption plan. This section shows the key differences between Consumption and Flex Consumption plan resource definitions.

 Important

You can't convert an existing Consumption plan app to Flex Consumption in place. You need to create new resources with a new name or delete the existing resources before deploying the Flex Consumption equivalents.

Key differences
When migrating your resource deployments from Consumption to Flex Consumption, consider these important changes:

Aspect	Consumption plan	Flex Consumption plan
Hosting plan SKU	Y1 (Dynamic)	FC1 (FlexConsumption)
Plan required	Optional (autocreated)	Required (must be explicit)
Operating system	Windows or Linux	Linux only
Configuration	App settings	functionAppConfig section
Storage content share	WEBSITE_CONTENTSHARE setting	deployment.storage in functionAppConfig
The following examples demonstrate the key differences between Consumption and Flex Consumption plan resource definitions. They use system assigned managed identity but aren't complete. They don't include all required resources such as storage accounts, Application Insights, or all necessary role assignments. For complete, production-ready examples, review the Flex Consumption IaC samples.

Bicep
Terraform
Consumption plan (before):

Bicep
// Consumption plan (optional - auto-created if omitted)
resource hostingPlan 'Microsoft.Web/serverfarms@2022-03-01' = {
  name: hostingPlanName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2022-03-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    siteConfig: {
      linuxFxVersion: 'DOTNET-ISOLATED|8.0'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'dotnet-isolated' }
        { name: 'AzureWebJobsStorage__accountName', value: storageAccount.name }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING__accountName', value: storageAccount.name }
        { name: 'WEBSITE_CONTENTSHARE', value: functionAppName }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'Authorization=AAD' }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}
Flex Consumption plan (after):

Bicep
// Flex Consumption plan (required)
resource hostingPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: hostingPlanName
  location: location
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  kind: 'functionapp'
  properties: {
    reserved: true
  }
}

// Deployment storage container (required)
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storageAccount.name}/default/deployments'
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: hostingPlan.id
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}deployments'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'dotnet-isolated'
        version: '8.0'
      }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageAccount.name }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'Authorization=AAD' }
      ]
    }
  }
  identity: {
    type: 'SystemAssigned'
  }
}
 Note

When you use APPLICATIONINSIGHTS_AUTHENTICATION_STRING with Authorization=AAD, you must also assign the Monitoring Metrics Publisher role to the function app's managed identity on the Application Insights resource.

For complete Bicep examples, see the Flex Consumption Bicep samples.

Reconciling resource deployments after migration
If you use infrastructure as code to manage your Azure resource deployments, update your deployment files after migrating to Flex Consumption to prevent configuration drift. Here's a recommended approach:

Don't mix manual and resource-based deployments: If you used the Azure CLI or portal to create your Flex Consumption app during migration, update your resource files before the next deployment. Otherwise, your deployments might attempt to recreate the old Consumption plan resources.

Update resource names or use lifecycle management: Since you can't convert a Consumption app to Flex Consumption in place, you have two options:

New resource names: Update your deployment code to use new names for the hosting plan and function app. This approach keeps your old resources intact until you're confident the migration succeeded.
Import existing resources: If you want to keep the same names, delete the old resources first, then let your deployment create the new Flex Consumption resources. Alternatively, import the manually created resources into your Terraform state by using terraform import or reference existing resources in Bicep.
Verify state alignment: After updating your deployment files, run a plan or preview operation (terraform plan or az deployment group what-if) to confirm no unexpected changes occur.

Update CI/CD pipelines: If your deployment pipelines reference the old Consumption plan configuration, update them to use the new Flex Consumption resource definitions and deployment methods.

 Tip

To minimize disruption, consider running both the old Consumption app and new Flex Consumption app in parallel during a transition period. Update your deployment to manage the new Flex Consumption app, verify it works correctly, then remove the old Consumption app resources from both Azure and your deployment files.

Remove the original app (optional)
 Tip

No rush here. Keep your original app for a few days or weeks while you verify everything works. The Consumption plan only charges for actual usage, so keeping the old app (with triggers disabled) costs little.

When you're confident the new app is working correctly, you can clean up the original. This step is optional - some teams keep the old app as a reference or rollback option.

 Important

This action deletes your original function app. The Consumption plan remains intact if other apps use it. Before you proceed, make sure you:

Successfully migrate all functionality to the new Flex Consumption app.
Verify no traffic is directed to the original app.
Backed up any relevant logs, configuration, or data that might be needed for reference.
GitHub Copilot
Azure CLI
Azure portal
Use the az functionapp delete command to delete the original function app:

Azure CLI
az functionapp delete --name <ORIGINAL_APP_NAME> --resource-group <RESOURCE_GROUP>
In this example, replace <RESOURCE_GROUP> and <APP_NAME> with your resource group and function app names.

Troubleshooting and recovery strategies
Most migrations finish without problems. If something doesn't work as expected, try these solutions for common problems:

Issue	Solution
Cold start performance problems	• Review concurrency settings
• Check for missing dependencies
Missing bindings	• Verify extension bundles
• Update binding configurations
Permission errors	• Check identity assignments and role permissions
Network connectivity problems	• Validate access restrictions and networking settings
Missing Application Insights	• Recreate the Application Insights connection
App fails to start	See General troubleshooting steps
Triggers aren't processing events	See General troubleshooting steps
If you experience problems migrating a production app, consider rolling back the migration to the original app while you troubleshoot.

General troubleshooting steps
Use these steps for cases where the new app fails to start or function triggers aren't processing events:

In your new app page in the Azure portal, select Diagnose and solve problems in the left pane of the app page. Select Availability and Performance and review the Function App Down or Reporting Errors detector. For more information, see Azure Functions diagnostics overview.

In the app page, select Monitoring > Application Insights > View Application Insights data then select Investigate > Failures and check for any failure events.

Select Monitoring > Logs and run this Kusto query to check these tables for errors:

traces
requests
Kusto
traces
    | where severityLevel == 3
    | where cloud_RoleName == "<APP_NAME>"
    | where timestamp > ago(1d)
    | project timestamp, message, operation_Name, customDimensions
    | order by timestamp desc
In these queries, replace <APP_NAME> with the name of your new app. These queries check for errors in the past day (where timestamp > ago(1d)).

Back in the app page, select Settings > Environment variables and verify that all critical application settings are correctly transferred. Look for any deprecated settings that might be incorrectly migrated or any typos or incorrect connection strings. Verify the default host storage connection.

Select Settings > Identity and double-check that the expected identities exist and that they're assigned to the correct roles.

In your code, verify that all binding configurations are correct, paying particular attention to connection string names, storage queue and container names, and consumer group settings in Event Hubs triggers.

Rollback steps for critical production apps
If you can't troubleshoot the problem, consider reverting to your original app while you continue to troubleshoot.

If the original app is stopped, restart it:

GitHub Copilot
Azure CLI
Azure portal
Use the az functionapp start command to restart the original function app:

Azure CLI
az functionapp start --name <ORIGINAL_APP_NAME> --resource-group <RESOURCE_GROUP>
If you created new queues, topics, or containers, ensure clients are redirected back to the original resources.

If you modified DNS or custom domains, revert these changes to point to the original app.

Providing feedback
If you encounter issues with your migration using this article or want to provide other feedback on this guidance, use one of these methods to get help or provide your feedback:

Get help at Microsoft Q&A
Create an issue in the Azure Functions repo
Provide product feedback
Create a support ticket
Related articles
Flex Consumption plan overview
How to use the Flex Consumption plan
Azure CLI flex-migration commands (Linux only)
Flex Consumption plan general availability announcement
Flex Consumption plan-specific samples
Additional resources
Documentation

Language and locale support for prebuilt models - Document Intelligence - Foundry Tools

Document Intelligence prebuilt / pretrained model language extraction and detection support.

Sign in with Azure CLI — Login and Authentication

Learn the different authentication types for your Azure CLI login — sign in with Azure CLI automatically, locally, or interactively using the az login command.

How to install the Azure CLI

The Azure CLI is available to install in Windows, Linux, and macOS environments. It can also be run in a Docker container and Azure Cloud Shell.

Show 5 more
Training

Certification

Microsoft Certified: Identity and Access Administrator Associate - Certifications

Demonstrate the features of Microsoft Entra ID to modernize identity solutions, implement hybrid solutions, and implement identity governance.

Last updated on 04/16/2026
In this article
Migration methods
What to expect
Benefits of migrating to Flex Consumption
Resource-based deployments
Prerequisites
Identify potential apps to migrate
Assess your existing app
Consider dependent services
Start the migration
Show 7 more
Was this page helpful?



AI Disclaimer
Previous Versions
Blog
Contribute
Privacy
Consumer Health Privacy
Terms of Use
Trademarks
© Microsoft 2026



portal says to move to Migrate your app to Flex Consumption as Linux Consumption will reach EOL on September 30 2028 and will no longer be supported.

what it will do? can we mirate? does it cost extra?


1. we can show how much time is left to process for comments since we know that time as 6h but do not hardcode 6 hr but use the same constand where defined