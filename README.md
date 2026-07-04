# IMS Server

Initial Node.js MVC server scaffold.

## Structure

- `config/` holds shared configuration such as database bootstrap.
- `src/controller/` handles request/response flow.
- `src/service/` contains business logic.
- `src/routes/` maps endpoints to controllers.
- `src/models/` defines data models.
- `src/middleware/` contains request middleware and error handling.
- `src/validator/` stores request validation rules.
- `utils/` contains reusable helpers.

## Local Setup

1. Copy `.env.example` to `.env` and fill in the values.
2. Run `npm install`.
3. Start the server with `npm run dev`.

## Branch Rule

Use `feature/{dev-name}/{module-name}` for new work.
Do not push directly to `main`.

## Pull Requests

- Keep PRs focused and small.
- Include a short summary of the change.
- Add validation notes when you change server behavior.
