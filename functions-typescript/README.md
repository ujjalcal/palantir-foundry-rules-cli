# TypeScript Functions in Foundry

## Overview

Functions enable code authors to write logic that can be executed quickly in operational contexts, such as dashboards and applications designed to empower decision-making processes. This logic is executed on the server side in an isolated environment.

To learn more, read the [Getting Started documentation](https://www.palantir.com/docs/foundry/functions/getting-started/).

## Local Development

It is possible to carry out high-speed, iterative development of TypeScript Functions locally. To get started, click the "Work locally" button in the top right.
Once you've cloned the repository locally, run `./gradlew localDev` in the root directory of the project to set up the environment.

## Live Preview

Functions can be previewed before publishing using the “Functions” tab accessible at the bottom of the window. With a file open, select “Live Preview” to execute Functions defined in that file with custom inputs.

## Publishing Functions

Functions can be published on a given branch by tagging a commit. Click the “Tag version” button at the top-right of the window and provide a version. Any Functions present in the repository as of the latest commit will be published with that version for use throughout Foundry.

## Writing Functions on Objects

Functions can easily access data that has been integrated into the Foundry Ontology. Any object or link types you want to use in your Function must be imported into the Project that contains this repository using the “Ontology Imports” side bar. Object types imported into the repository via the side bar can be imported from `@foundry/ontology-api`.

For example, to use an imported object type called "Aircraft", add `import { Aircraft } from "@foundry/ontology-api”;` to the file where that type will be used. 
Once imported, Functions can use object or links types as standard inputs, like so:

```typescript
@Function()
public myFunction(airport: Airport) {
    // Your custom logic
}
```

To learn more about using Functions on Objects in Typescript Functions repositories, read the [getting started guide](https://www.palantir.com/docs/foundry/functions/foo-getting-started/).