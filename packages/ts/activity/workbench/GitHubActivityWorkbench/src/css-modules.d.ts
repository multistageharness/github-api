// Ambient types for CSS modules so `import styles from './X.module.css'`
// type-checks. Vite resolves the actual class-name map at build time.
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
