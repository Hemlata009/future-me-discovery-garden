# Future Me Discovery Garden

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/571f93c1-abef-4042-b48a-499f9160e283).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Server-side configuration

AI project generation talks to Anthropic directly. The values below are read on
the server only — none of them is ever sent to the browser. Set them in Project
Settings → Secrets (`.env.example` lists the same names with placeholders).

| Name | Needed for | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Generating a student's project | Anthropic API key. Without it the wizard reports that AI generation isn't switched on. |
| `ANTHROPIC_MODEL` | Choosing the model | Optional. Defaults to `claude-sonnet-5-5`. |
| `SUPABASE_URL` | Saving and reading projects | Provided by Lovable Cloud. |
| `SUPABASE_SERVICE_ROLE_KEY` | Saving a project, and opening a shared link | Server-only. It is the only path that can read a saved project. |
| `SUPABASE_PUBLISHABLE_KEY` | Public, read-only lookups from server code | Server-only here; the browser gets the `VITE_` copy. |

Saved student projects are not readable straight from the database: anonymous
visitors and signed-in users have no access, and the shared-link page fetches
exactly one project by its id on the server.

Environment files are not committed — `.env` and `.env.*` are ignored, with
`.env.example` kept as the documented template.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
