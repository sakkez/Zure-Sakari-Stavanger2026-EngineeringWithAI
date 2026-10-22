# Spec Delta

## Purpose

The dataset of Statkraft's Norwegian hydropower plants that the site shows: which plants are included, what each record holds, where it comes from and how it's refreshed.

## ADDED Requirements

### Requirement: Plants come from NVE public data
The plant dataset SHALL be built from NVE's public hydropower data: plant attributes and owners from the NVE power plant API, and plant locations from the NVE hydropower map service. The two sources are joined on NVE's plant number.

#### Scenario: Refresh the dataset
- **WHEN** a developer runs the plant data refresh command with network access
- **THEN** a new snapshot file is written with the plants and the date the data was fetched

#### Scenario: Source unavailable
- **WHEN** the refresh command can't reach either NVE source, or gets an invalid response
- **THEN** it exits with a non-zero status and an error message, and leaves the existing snapshot unchanged

### Requirement: Dataset includes Statkraft's generating plants
The dataset SHALL include every hydropower plant in operation where a Statkraft company holds an ownership share greater than zero, and that generates power (power plants and pumped-storage plants). It SHALL leave out pure pumping stations.

#### Scenario: Statkraft-owned plants are included
- **WHEN** NVE lists a plant in operation with a Statkraft company among its owners, of type power plant or pumped-storage plant
- **THEN** the plant is in the dataset

#### Scenario: Pumps and other owners are excluded
- **WHEN** NVE lists a pure pumping station, or a plant with no Statkraft owner
- **THEN** it is not in the dataset

### Requirement: Each plant record is complete
Each plant SHALL have: NVE plant number (unique), name, latitude and longitude (WGS84), maximum output in MW, mean annual production in GWh, plant type, county, municipality, catchment name, year in operation, and Statkraft's total ownership share in percent. A plant with no location in the map service SHALL be left out and reported by the refresh command.

#### Scenario: Snapshot is valid
- **WHEN** the committed snapshot is checked
- **THEN** every plant has all the fields above, plant numbers are unique, every location lies within mainland Norway's bounds (57.9–71.2 N, 4.5–31.2 E), and every ownership share is greater than 0 and at most 100

#### Scenario: Plant without location
- **WHEN** a plant matches the inclusion rule but the map service has no point for it
- **THEN** the refresh command leaves it out and prints its name and plant number

### Requirement: Site uses the committed snapshot
The site SHALL read plant data only from the committed snapshot, never from NVE at runtime.

#### Scenario: NVE is unreachable
- **WHEN** a visitor opens the site and NVE's servers can't be reached
- **THEN** all plants are still shown
