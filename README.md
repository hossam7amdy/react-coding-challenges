# React Coding Challenges

My playground for React katas: design patterns, challenges found around the
internet, and re-implementations of library/React internals to understand how
they work.

Each challenge lives in its own top-level folder with the implementation, its
tests, and (sometimes) a `README.md` describing the task.

## Setup

```sh
pnpm install
```

## Scripts

```sh
pnpm test       # vitest (jsdom)
pnpm typecheck  # tsc --noEmit
pnpm lint       # oxlint
```

## Adding a challenge

1. Create a folder named after the challenge.
2. Write the tests first, then the implementation next to them.
3. Add a `README.md` if the task needs explaining, and a row to the table above.
