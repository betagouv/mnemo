import type {
  IfcElementDetails,
  IfcPropertyValue,
} from "@mnemo/ifc-viewer-adapter";

import styles from "./ifc-element-properties.module.css";

function formatValue(value: IfcPropertyValue): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    return new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 4,
    }).format(value);
  }
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  return value;
}

export function IfcElementProperties({
  element,
}: {
  element: IfcElementDetails;
}) {
  const groups = [
    ...element.propertySets.map((set) => ({ ...set, kind: "Propriétés" })),
    ...element.quantitySets.map((set) => ({ ...set, kind: "Quantités" })),
  ];

  return (
    <div className={styles.content}>
      <section className={styles.identity}>
        <span>{element.ifcClass}</span>
        <h2>{element.name || `${element.ifcClass} #${element.expressId}`}</h2>
        {element.description ? <p>{element.description}</p> : null}
      </section>

      <dl className={styles.metadata}>
        <div>
          <dt>Express ID</dt>
          <dd>{element.expressId}</dd>
        </div>
        <div>
          <dt>GlobalId</dt>
          <dd title={element.globalId}>{element.globalId || "—"}</dd>
        </div>
        {element.objectType ? (
          <div>
            <dt>Type d’objet</dt>
            <dd>{element.objectType}</dd>
          </div>
        ) : null}
        {element.tag ? (
          <div>
            <dt>Repère</dt>
            <dd>{element.tag}</dd>
          </div>
        ) : null}
      </dl>

      <div className={styles.groups}>
        {groups.length ? (
          groups.map((group, index) => (
            <details
              className={styles.group}
              key={`${group.kind}-${group.name}-${index}`}
              open={index === 0}
            >
              <summary>
                <span>
                  <small>{group.kind}</small>
                  {group.name || "Sans nom"}
                </span>
                <strong>{group.values.length}</strong>
              </summary>
              <dl>
                {group.values.map((property, propertyIndex) => (
                  <div key={`${property.name}-${propertyIndex}`}>
                    <dt>{property.name}</dt>
                    <dd title={formatValue(property.value)}>
                      {formatValue(property.value)}
                      {property.unit ? ` ${property.unit}` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))
        ) : (
          <p className={styles.empty}>
            Aucun jeu de propriétés sur cet élément.
          </p>
        )}
      </div>
    </div>
  );
}
