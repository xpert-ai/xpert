# XpertAI Core Server

`@metad/server-core` is the core service library of the XpertAI platform, providing unified foundational capabilities such as tenant isolation, organizational structure, user and permission management for upper-layer business modules. Built on NestJS, this package integrates key components like authentication, storage, caching, and internationalization, serving as the backbone for building intelligent analytics applications and enterprise-level AI scenarios.

## Core Features

- **Tenant Management**: Supports multi-tenant models, offering tenant lifecycle management, configuration isolation, and resource quota control.
- **Organizational Model**: Built-in hierarchical structures for organizations, departments, and positions to meet complex enterprise modeling needs.
- **User Management**: Covers user registration, profile maintenance, preference settings, and account security.
- **Role & Permissions**: Implements fine-grained roles and permission strategies, supporting custom capability matrices and multi-role stacking.
- **Authentication & Authorization**: Integrates common authentication methods such as JWT and OAuth, with session management, permission checks, and audit logs.
- **File Service**: Unified abstraction for local and cloud storage (e.g., S3/OSS), supporting file uploads, version management, and access control.
- **Event & Task Processing**: Utilizes Bull queues and an event bus for asynchronous task scheduling and cross-module event orchestration.
- **Internationalization Support**: Built-in i18n capabilities for multi-language UI and notification content output.

## Architectural Highlights

- **Modular Design**: Follows NestJS module separation principles, making it easy to introduce or extend business domains as needed.
- **Data Access Layer**: Domain entities built on TypeORM, supporting mainstream relational databases and providing migration tools.
- **API Protocols**: Compatible with both REST and GraphQL, facilitating integration with front-end and third-party systems.
- **Observability**: Built-in logging, health checks, and Sentry integration to support production operations and troubleshooting.
- **Security**: Supports session control, password policies, request rate limiting, and sensitive operation auditing.
