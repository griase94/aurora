# Aurora canary

A throwaway package. It exists only to exercise Aurora's CI and release pipeline
(`0.0.x` releases are pipeline proofs) and is removed when the kit packages arrive.

```ts
import { chirp } from "@aurora/canary";

chirp("Atlas"); // "Aurora canary says hello, Atlas."
```
