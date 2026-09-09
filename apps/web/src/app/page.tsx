import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>MNEMO</p>
      <h1>La fondation est prête.</h1>
      <p className={styles.description}>
        Le nouvel espace de travail BIM est construit progressivement, avec une
        architecture explicite et testable.
      </p>
    </main>
  );
}
