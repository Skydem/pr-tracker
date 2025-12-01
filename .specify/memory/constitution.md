# PR Tracker Constitution

## Core Principles

### I. Single Responsibility Principle (SRP)

Every class, service, and module MUST have one and only one reason to change.

**Requirements:**
- Each TypeScript class/module handles exactly one domain concept or responsibility
- Services encapsulate one business capability
- Handlers process one type of event/command
- Keep functions focused and concise

**Rationale:** Single responsibility ensures that changes to one aspect of functionality do not ripple through unrelated code, reducing coupling and improving maintainability.

### II. Open/Closed Principle (OCP)

Software entities MUST be open for extension but closed for modification.

**Requirements:**
- Use interfaces and types to define contracts
- Extend functionality through composition, not by modifying existing code
- New webhook event handlers MUST be added via new functions, not by modifying existing handlers
- Use event-driven patterns for cross-cutting concerns

**Rationale:** The OCP prevents regression bugs when adding new features. Adding support for a new Bitbucket event should not require changes to existing event handlers.

### III. Liskov Substitution Principle (LSP)

Subtypes MUST be substitutable for their base types without altering program correctness.

**Requirements:**
- Implementations MUST honor interface contracts
- Method signatures in implementations MUST match interface declarations exactly
- Null returns, exceptions, and side effects MUST be consistent with base contracts

**Rationale:** LSP ensures polymorphism works correctly. When the notification system calls a service, it must be able to trust that any implementation will behave consistently.

### IV. Interface Segregation Principle (ISP)

Clients MUST NOT be forced to depend on interfaces they do not use.

**Requirements:**
- Create focused, client-specific interfaces rather than monolithic ones
- Split large interfaces into smaller, cohesive contracts
- Modules MUST only declare dependencies on the specific capabilities they need

**Rationale:** ISP prevents unnecessary coupling and makes testing easier.

### V. Dependency Inversion Principle (DIP)

High-level modules MUST NOT depend on low-level modules; both MUST depend on abstractions.

**Requirements:**
- Type-hint against interfaces, not concrete implementations where practical
- Configuration dependencies MUST be injected, not accessed via global state
- Database access MUST go through Prisma client, not direct SQL
- External API clients (Slack) MUST be wrapped in service abstractions

**Rationale:** DIP enables testing, flexibility, and decoupling. Business logic should not know whether it's calling a real API or a test stub.

### VI. Separation of Concerns

Different concerns MUST be handled in different layers with clear boundaries.

**Requirements:**
- **Handler Layer (Webhooks, Commands):** Handle HTTP/Slack concerns only, delegate to services
- **Service Layer:** Implement domain rules, orchestrate workflows
- **Data Layer (Prisma):** Handle persistence, encapsulate database details
- Handlers MUST delegate to services, not implement business rules directly
- Business logic MUST NOT contain framework-specific code

**Rationale:** Clear separation makes each layer independently testable and replaceable.

### VII. Code Modularity

Code MUST be organized into cohesive, loosely coupled modules with explicit boundaries.

**Requirements:**
- Group related functionality by domain concept (services/, commands/, webhooks/)
- Modules communicate through well-defined interfaces
- Avoid circular dependencies between modules
- Each directory represents a feature module with clear responsibilities

**Rationale:** Modularity enables parallel development, simplifies understanding, and allows incremental refactoring.

### VIII. Scalability & Performance

Code MUST be written with performance and scalability as first-class concerns.

**Requirements:**
- **Database Queries:** Use Prisma efficiently; avoid N+1 queries
- **API Calls:** Implement timeouts and proper error handling for Slack API
- **Resource Usage:** Handle async operations properly, avoid memory leaks
- **Indexes:** Ensure database indexes exist for frequently queried columns

**Rationale:** Poor performance directly impacts user experience. Scalability must be designed in, not retrofitted.

## Code Quality Standards

### Readability & Maintainability

**Requirements:**
- Use descriptive variable and function names that reveal intent
- Keep functions focused and concise (<50 lines preferred)
- Avoid deep nesting (maximum 3 levels of indentation)
- Use early returns to reduce nesting and improve readability

### Clean Code Practices

**Requirements:**
- No dead code, commented-out code, or unused imports
- No magic numbers; use named constants or configuration
- No duplicated logic; extract shared code into reusable functions
- Use TypeScript strict mode; avoid `any` type

### Error Handling

**Requirements:**
- Use try/catch for async operations that can fail
- Log errors with context for debugging
- Return meaningful error messages to users
- Validate inputs at system boundaries (webhook handlers, commands)

## Development Workflow

### Code Review Requirements

**Requirements:**
- All code changes MUST go through pull request review before merging to `main`
- Reviewers MUST verify adherence to SOLID principles and separation of concerns
- Pull requests MUST include a clear description of changes and rationale

### Testing Requirements

**Requirements:**
- Services MUST have unit tests
- Tests MUST mock external dependencies (Prisma, Slack)
- Use Vitest for all tests
- Maintain test coverage for critical business logic

### Refactoring Discipline

**Requirements:**
- Refactoring MUST be done incrementally, not as "big bang" rewrites
- Extract reusable code when a pattern appears three times (Rule of Three)

## Governance

This constitution guides development practices for the PR Tracker project.

**Version**: 1.0.0 | **Created**: 2025-12-01
