# Spec Delta

## ADDED Requirements

### Requirement: One marker per plant
The map SHALL show exactly one marker for each plant in the dataset, at the plant's location.

#### Scenario: All plants are on the map
- **WHEN** the page has loaded
- **THEN** the number of plant markers equals the number of plants in the dataset
- **AND** every marker's position equals its plant's latitude and longitude

### Requirement: Marker identifies the plant
Each plant marker SHALL have an accessible name containing the plant's name. Hovering over or keyboard-focusing a marker SHALL show a tooltip with the plant's name and maximum output in MW.

#### Scenario: Hover shows name and capacity
- **WHEN** the visitor hovers over the marker for a plant
- **THEN** a tooltip shows that plant's name and its maximum output, for example "Kvilldal – 1240 MW"

#### Scenario: Marker is reachable by name
- **WHEN** an assistive technology lists the map's markers
- **THEN** each marker's accessible name contains its plant's name

### Requirement: Data source is shown
The page SHALL show the data source and the snapshot date, as "Source: NVE, data as of <YYYY-MM-DD>", with a link to NVE.

#### Scenario: Source note is visible
- **WHEN** the page has loaded
- **THEN** the text "Source: NVE, data as of" followed by the snapshot's date is visible, and links to nve.no
