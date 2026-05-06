# Create Sandbox Wizard Design

## Context

The AgentPod TUI currently supports login, token persistence, sandbox listing, and dashboard lifecycle actions. The next sandbox-management slice is a full create-sandbox wizard that opens from the dashboard and drives the existing `ApiClient::create_sandbox` API.

The desktop app already supports creating projects from scratch or from GitHub/GitLab URLs, selecting runtime flavor, resource tier, and add-ons. The TUI should mirror that workflow while staying optimized for keyboard-first terminal use.

## Goals

- Add a guided create-sandbox flow to the TUI.
- Support scratch and Git import creation paths.
- Collect name, description, runtime flavor, resource tier, and add-ons.
- Provide a review step before sending the create request.
- Keep the flow testable through app-state and API mock tests.

## Non-Goals

- Dynamic flavor, tier, and add-on list endpoints are not required for the first implementation slice.
- Image pulling, flavor availability checks, providers, agent selection, project icons, and OpenCode session creation are out of scope.
- Rich async progress polling is out of scope; the first slice returns to the dashboard after create succeeds.

## Layout

Use a vertical stepper with a focused pane.

The left pane lists the five steps and highlights the active step:

1. Source
2. Details
3. Runtime
4. Add-ons
5. Review

The right pane renders only the active step's fields and validation help. This keeps each screen readable in narrow terminals and gives enough room for errors and key hints.

## Flow

### Source

The user chooses one source mode:

- `scratch`: create a new empty project.
- `git`: import from a GitHub or GitLab URL.

For `git`, the URL is required and must contain `github.com/` or `gitlab.com/`. The wizard derives a default name from the repository slug when possible.

### Details

The user enters:

- Name, required.
- Description, optional.

Name validation requires at least one non-whitespace character.

### Runtime

The user selects:

- Flavor, defaulting to `config.defaults.flavor`.
- Resource tier, defaulting to `config.defaults.resource_tier`.

The initial TUI slice uses static choices that match existing known IDs: `js`, `python`, `go`, `rust`, `fullstack`, `polyglot`, `bare` for flavors and `starter`, `builder` for resource tiers. Dynamic API-backed selectors can replace these lists later without changing the app-state contract.

### Add-Ons

The user toggles zero or more add-ons. `code-server` is selected by default. The initial static list is `code-server`; other add-ons can be added when the API list endpoint is wired.

### Review

The wizard shows the request summary:

- Source mode.
- Git URL if present.
- Name.
- Description if present.
- Flavor.
- Resource tier.
- Add-ons.

From review, `Ctrl+S` sends the create request.

## Keyboard Model

- `n`: Opens the wizard from Dashboard.
- `Tab`: Moves focus within the active step.
- `Shift+Tab`: Moves focus backward within the active step.
- `Enter`: Advances to the next step when the active step is valid.
- `Esc`: Moves to the previous step, or cancels back to Dashboard from Source.
- `Space`: Toggles source mode, runtime choices, and add-ons depending on the active step.
- `Up`/`Down` or `k`/`j`: Move among selectable lists.
- `Ctrl+S`: Creates from Review.
- `q`: Does not quit while inside the wizard.

## App State

Add `View::CreateSandbox`.

Add focused wizard state to `App`:

- Current step.
- Source mode.
- Focus index for the active step.
- Name, description, and git URL fields.
- Selected flavor and resource tier.
- Selected add-ons.
- Error message.
- Submitting flag.

The state should be initialized from `Config` when opening the wizard. Canceling clears transient wizard state. Successful creation returns to Dashboard.

## API Behavior

The wizard sends `CreateSandboxRequest` through `ApiClient::create_sandbox`.

For scratch creation:

- `name`: entered name.
- `description`: entered description if non-empty.
- `githubUrl`: omitted.
- `flavor`: selected flavor.
- `resourceTier`: selected tier.
- `addons`: omitted when no add-ons are selected.

For Git import:

- `name`: entered name, or derived repo slug if the user did not override it.
- `description`: entered description if non-empty.
- `githubUrl`: entered URL.
- `flavor`: selected flavor.
- `resourceTier`: selected tier.
- `addons`: omitted when no add-ons are selected.

On success, append the created sandbox to the dashboard list or refresh the list, select the created sandbox, clear the wizard, and return to Dashboard.

On failure, stay in the wizard on Review, clear `submitting`, and show the error message.

## Error Handling

Validation errors are local and shown on the active step.

API errors are shown on the Review step after create fails. The user can edit prior steps with `Esc` or retry with `Ctrl+S` after changing values.

## Testing Plan

Use TDD for each behavior:

- Dashboard `n` opens `View::CreateSandbox` with defaults from config.
- `Esc` cancels from Source and returns to Dashboard.
- `Enter` does not leave Source when Git mode has an invalid URL.
- `Enter` advances through valid steps.
- `Space` toggles source mode and add-ons.
- Runtime selection changes flavor and resource tier.
- Scratch create sends a request without `githubUrl`.
- Git create sends a request with `githubUrl` and derived or entered name.
- Successful create returns to Dashboard and selects the created sandbox.
- Failed create stays on Review and displays the API error.

## Implementation Notes

Keep the first implementation minimal and state-driven. Avoid adding a general form framework. Add small enums and helper methods only where they make tests clearer:

- `CreateSandboxStep`
- `CreateSandboxSource`
- `CreateSandboxWizardState`

Rendering can be basic at first: a step list, the active pane, validation error text, and key hints. The app-state behavior and request shape are the priority.
