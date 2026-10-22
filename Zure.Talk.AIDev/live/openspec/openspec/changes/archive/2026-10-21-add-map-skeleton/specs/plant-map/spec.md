# Spec Delta

## Purpose

The at-a-glance web page that shows Statkraft's Norwegian hydropower plants on an interactive map of Norway, as the base for showing each plant's environmental impact.

## ADDED Requirements

### Requirement: Page identifies the site
The page SHALL show a visible header with the text "Statkraft Hydropower – Environmental Impact at a Glance". The browser document title SHALL contain "Environmental Impact at a Glance".

#### Scenario: Visitor opens the site
- **WHEN** a visitor opens the site's root URL
- **THEN** the header text "Statkraft Hydropower – Environmental Impact at a Glance" is visible
- **AND** the document title contains "Environmental Impact at a Glance"

### Requirement: Map opens on Norway
The page SHALL show an interactive map that fills the area below the header. On load, the map view SHALL include all of mainland Norway, from Lindesnes in the south to the North Cape in the north.

#### Scenario: Initial view covers mainland Norway
- **WHEN** the page has loaded
- **THEN** the map is visible and has a non-zero width and height
- **AND** the map's visible bounds contain latitude 58.0 to 71.1 and longitude 5.0 to 31.0

#### Scenario: Map fills the viewport on a phone
- **WHEN** the page is loaded in a 390x844 viewport
- **THEN** the map is visible, is at least as wide as the viewport minus 1 pixel, and the page has no horizontal scroll

### Requirement: Map is navigable
The map SHALL let the visitor zoom in and out with on-screen controls and pan by dragging.

#### Scenario: Zoom in with the control
- **WHEN** the visitor clicks the zoom-in control
- **THEN** the map's zoom level increases by one

### Requirement: Base map with attribution
The map SHALL show an OpenStreetMap base layer and SHALL display the attribution "© OpenStreetMap contributors".

#### Scenario: Attribution is shown
- **WHEN** the page has loaded
- **THEN** the map's attribution area contains the text "OpenStreetMap contributors"

#### Scenario: Base layer tiles are requested
- **WHEN** the page has loaded
- **THEN** the page requests at least one map tile image for the base layer
