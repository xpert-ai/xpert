# Xpert Workspace Components

This folder contains reusable components and services related to the Xpert Workspace feature in the Cloud application. These components are designed to facilitate the development and management of workspace functionalities, providing a consistent user experience across the application.

## Components

### `xp-select-database`

A standalone modal that mirrors the product design for choosing a database table. It focuses on the UI/interaction layer and exposes hooks so feature modules can plug their own data sources.

Key inputs/outputs:

- `[(opened)]` – control modal visibility.
- `[databases]`, `[loading]`, `[hasMore]` – feed backend data and pagination state.
- `(filterChanged)` – emits whenever search/nav/order filters change (hook API calls here).
- `(databaseSelected)`, `(createRequested)`, `(refreshRequested)`, `(loadMoreRequested)` – high level intents you can connect to workspace services.
