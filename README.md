# EV Charge Manager  

> A software engineering specification and system design for a unified electric-vehicle charging platform.

**EV Charge Manager (EV-CMA)** is an academic software engineering project that defines the requirements, architecture, user flows, and interfaces of an end-to-end EV charging management system.

The platform is designed for a charging-network provider and supports both EV drivers and system administrators. Drivers can locate chargers, make reservations, manage charging sessions, complete payments, and review their charging history. Administrators can manage charging infrastructure and retrieve operational statistics through a dedicated command-line interface.

> **Project status:** Requirements and system-design phase. This repository currently contains the Software Requirements Specification, UML models, activity diagrams, and user-interface wireframes.

## Core Features 

### For EV Drivers

- Create and manage a user account
- Find nearby chargers on a map or list
- Filter chargers by availability, connector type, power, price, and distance
- View charger specifications and real-time status
- Reserve an available charger
- Check in and start a charging session
- Monitor energy consumption, elapsed time, and estimated cost
- Stop charging manually or automatically
- Complete payment through an external payment provider
- View receipts, charging history, and usage statistics

### For Charging-Network Administrators

- Authenticate through a secure CLI
- Add new chargers to the network
- Modify charger configuration, tariffs, and availability
- Inspect charger status and fault information
- Retrieve network-wide usage, energy, and revenue reports

## Main User Flow

```text
Find Charger
    ↓
Apply Filters
    ↓
View Charger Details
    ↓
Reserve Charger
    ↓
Arrive and Check In
    ↓
Payment Pre-Authorization
    ↓
Start and Monitor Charging
    ↓
Complete Payment
    ↓
View Receipt and Statistics
```

## System Architecture

The proposed architecture follows a layered design:

| Layer | Main Components |
|---|---|
| Client layer | Web application, mobile interface, and admin CLI |
| API layer | REST API gateway |
| Business logic | Authentication, reservations, charging-session management, payments, pricing, profiles, and statistics |
| Data layer | Users, vehicles, chargers, reservations, sessions, tariffs, and payments |
| External integrations | Payment provider, authentication service, map service, energy-market service, and charging infrastructure |

Clients communicate with the backend through secure REST APIs. The backend acts as the only access point to persistent data and coordinates all communication with external services and charger devices.

## External Integrations

The design supports integration with:

- **Payment Service Provider:** payment pre-authorization, final charging, and refunds
- **Authentication Service:** OAuth 2.0 / OpenID Connect identity and authorization
- **Map and Routing Service:** charger visualization, location search, and navigation
- **Energy Market Service:** electricity-price data for future dynamic pricing
- **Charging Infrastructure:** charger status, telemetry, metering, and start/stop commands

## Requirements Highlights

### Functional Requirements

The specification defines 21 functional requirements covering:

- User registration and authentication
- Profile and payment-method management
- Charger discovery and filtering
- Reservations
- Charging-session control and monitoring
- Payment processing
- Session history and reporting
- Administrative charger and network management

### Performance Targets

- 95% of common user requests should complete within **2 seconds**
- The charger map should become interactive within **3 seconds**
- Charger availability should refresh every **30 seconds**
- The system should support at least **500 concurrent user sessions**
- Reservation operations must be atomic to prevent double booking
- Payment processing should complete within **5 seconds** in 95% of cases

### Availability and Security

The proposed system includes:

- 99.5% monthly uptime target
- Automatic failover and operational monitoring
- Backup restoration within 30 minutes
- TLS-secured communication
- Role-based access control
- Multi-factor authentication for administrators
- Password hashing and secure session management
- Tokenized, PCI-DSS-compliant payment handling
- Protection against SQL injection and cross-site scripting
- GDPR-aware personal-data handling

## Repository Structure

```text
.
├── README.md
├── SRS_final.md
├── wireframes/
│   ├── ui2_map_view.png
│   ├── ui3_charger_details.png
│   ├── ui4_reservation_setup.png
│   ├── ui5_countdown.png
│   ├── ui7_active_charging.png
│   ├── ui8_summary.png
│   ├── ui9_profile_stats.png
│   └── ui10_detailed_history.png
└── activity_diagrams/
    ├── Activity1.png
    ├── Activity2.png
    └── Activity3.png
```

## Documentation

The complete requirements document includes:

- Project purpose and stakeholder analysis
- System and external interfaces
- UML component and use-case diagrams
- User-interface wireframes and navigation flow
- Detailed use cases and alternate flows
- Functional, performance, data, availability, and security requirements
- Semantic data model
- Glossary and references

Read the full specification here:

**[Software Requirements Specification](./SRS_final.md)**

## Models and Diagrams

The repository uses **PlantUML** for several architecture and requirements diagrams. They can be rendered using:

- A PlantUML-compatible IDE extension
- A Markdown viewer with PlantUML support
- The PlantUML command-line tool or server

Pre-rendered activity diagrams and UI wireframes are included as image files.

## Technologies and Standards Considered

- RESTful HTTP APIs
- HTTPS and TLS
- JSON
- SQL databases
- OAuth 2.0
- OpenID Connect
- JWT or secure server-side sessions
- Role-based access control
- PCI-DSS
- GDPR
- HTTP, MQTT, WebSockets, or vendor-specific charger protocols

## Academic Context

This repository was created for the **NTUA School of Electrical and Computer Engineering Software Engineering course, academic year 2025–2026**.

## Scope

This project currently focuses on requirements engineering and architectural design. Technology choices such as the frontend framework, backend language, database engine, payment provider, and charger communication protocol may be finalized during implementation.
