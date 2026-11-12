# Claude Code Instructions

These guidelines apply to the entire project.

- The backend and web frontend use TypeScript.
- The iOS app uses Swift.
- Apply the same principles to all three codebases unless a language-specific convention requires otherwise.

## Documentation comments

Use the project's JSDoc/Doxygen hybrid style for constants, interfaces, types, classes, and functions.

### Requirements

- Use a `/** ... */` documentation block.
- Include the appropriate tag:
  - `@constant` for constants
  - `@interface` for interfaces
  - `@type` for type definitions
  - `@class` for classes
  - `@method` for methods
  - `@function` for functions
- Include `@description` in every documentation block.
- Document interface and object properties with inline comments in this format:
  `/*!< Comment text */`

### Example

```typescript
/**
 * @interface User
 * @description Represents a system user
 */
export interface User {
    id: string; /*!< Unique identifier */
}
```

### No other comments

- Write no comment other than the documentation blocks `/** ... */`, the property comments `/*!< ... */`, and the copyright header.
- Do not write `//` or `/* */` comments, inside or outside function bodies.
- When code needs an explanation, put it in the `@description` of the documented function or constant, or move the code into a named and documented function or constant.

## Coding standards

### Types and nullability

- Use `interface` for data structures.
- Use `Maybe<T>` for nullable values (`T | null`).
- Use `Perhaps<T>` for optional values (`T | undefined`).

### Type safety

- Do not use TypeScript type assertions with `as`.
- Use schema validation or type guards to narrow types.
- Use `unknown` only when a cast is unavoidable and no safer alternative exists.

### Control flow

- Prefer early returns and guard clauses to reduce nesting.
- Always use braces for `if` and `else` blocks, even when the block contains only one statement.
- Write a condition with `!==` (`!=` in Swift) rather than `===` (`==`) whenever that keeps the code about as simple: flip the branches of a ternary or of an `if`/`else`, and use De Morgan's laws for a compound condition. Keep `===` where flipping would mean a heavy change, such as a guard clause, whose early return would otherwise nest the rest of the function.

```typescript
// Bad
if (x) return;
if (x) { return; }

// Good
if (x) {
    return;
}

// Bad
const label: string = place === null ? '' : place.name;

// Good
const label: string = place !== null ? place.name : '';
```

### Functions

- Always specify an explicit return type, such as `: void` or `: Promise<void>`.

### Line breaks

- Keep each expression and each list on one line, whatever its length: ternaries, boolean and arithmetic expressions, method chains, call arguments, parameters, type arguments and unions, and import and export lists.
- Only the inside of an object literal, an array literal or a function body may span several lines, and a line may break only right after the `{` or `[` that opens one of them.
- When a line would be hard to read, move its parts into named constants or functions instead of breaking it.

```typescript
// Bad
const label: string = isActive
    ? 'Active'
    : 'Inactive';
const total: number = items
    .filter(isVisible)
    .reduce(sum, 0);
await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix })
);

// Good
const label: string = isActive ? 'Active' : 'Inactive';
const total: number = items.filter(isVisible).reduce(sum, 0);
await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
```

### HTML and JSX

- Keep each tag on one line with all its attributes, whatever their number or the line's length.
- When an attribute's value would span several lines (a callback with a body, a block of JSX), move it out of the tag into a named function or constant, so the tag stays on one line.

```tsx
// Bad
<AlertComponent
    open={isOpen}
    onConfirm={() => {
        close();
        void signOut();
    }}
/>

// Good
<AlertComponent open={isOpen} onConfirm={confirmSignOut} />
```

## Commit and push workflow

When pending changes are ready, use the following workflow:

1. Group changes by intent, not by file.
2. Squash changes that are too small to stand alone into the related commit.
3. Create a commit using Conventional Commits, matching the style already used in the repository:
   - Use a lowercase description.
   - Use an optional scope in parentheses.
   - Keep the message to exactly one line.
   - Do not add a body, co-author trailer, or tool-attribution trailer.
4. Do not push. Push only when the user explicitly asks for it in the current conversation; otherwise, once committed, stop and ask.

### Version bumps

Create version bumps in a separate commit for each repository touched. Determine the version change using SemVer:

- Bug fix: patch version
- New capability: minor version
- Breaking change: major version

When the project uses both files, update `package.json` and `package-lock.json` together. Use this commit format:

```text
chore: bump version to X.Y.Z
```
