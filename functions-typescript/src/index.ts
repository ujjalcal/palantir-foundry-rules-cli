// import { Function, OntologyEditFunction, Integer } from "@foundry/functions-api";

// Uncomment the import statement below to start importing object types
// import { Objects, ExampleDataAircraft } from "@foundry/ontology-api";

export class MyFunctions {
    /*
    @Function()
    public myFunction(n: Integer): Integer {
         return n + 1;
    }

    // Note that "ExampleDataAircraft" may not exist in your ontology

    @Function()
    public async aircraftSearchExample(): Promise<ExampleDataAircraft[]> {
        const aircraft: ExampleDataAircraft[] = await Objects.search().exampleDataAircraft().allAsync();

        return aircraft;
    }

    @Function()
    public async aircraftAggregationExample(): Promise<TwoDimensionalAggregation<string>> {
        const aggregation = Objects.search().exampleDataAircraft()
                 .filter(aircraft => aircraft.arrivalCity.exactMatch('NYC'))
                 .groupBy(aircraft => aircraft.departureCity.topValues())
                 .count();

        return aggregation;
    }

    @OntologyEditFunction()
    public async aircraftEditExample(): Promise<void> {
        const aircraft = await Objects.search().exampleDataAircraft()
                 .filter(aircraft => aircraft.arrivalCity.exactMatch('NYC'))
                 .allAsync();

        aircraft.forEach(a => a.status = 'delayed');
    }
    */
}
