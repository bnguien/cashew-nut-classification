# Mobile App Structure

## Routing
- `app/_layout.tsx`: root stack.
- `app/(tabs)/_layout.tsx`: bottom tab navigation.
- `app/(tabs)/*.tsx`: tab screens (`home`, `live`, `history`, `stats`, `settings`).
- `app/session/[id].tsx`: session detail route.

## Source Modules
- `src/config`: runtime environment config.
- `src/constants`: endpoints, storage keys, static constants.
- `src/types`: shared API/domain types.
- `src/services/http`: REST clients for Django API.
- `src/services/ws`: WebSocket adapters.
- `src/hooks`: reusable hooks (realtime, polling).
- `src/store`: global state container.
- `src/components`: reusable presentational components.
- `src/utils`: pure formatting helpers.

## Development Flow
1. Define contract in `src/types`.
2. Implement API layer in `src/services`.
3. Connect hook/store logic in `src/hooks` and `src/store`.
4. Build UI in `app/(tabs)` screens.
