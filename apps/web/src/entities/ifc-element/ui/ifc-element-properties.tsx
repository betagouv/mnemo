import Accordion from "@codegouvfr/react-dsfr/Accordion";
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
  modelName,
}: {
  element: IfcElementDetails;
  modelName: string | null;
}) {
  const groups = [
    ...element.propertySets.map((set) => ({ ...set, kind: "Propriétés" })),
    ...element.quantitySets.map((set) => ({ ...set, kind: "Quantités" })),
  ];

  return (
    <div className={styles.content}>
      <section className={styles.identity}>
        <span>{element.ifcClass}</span>
        <h3>{element.name || `${element.ifcClass} #${element.expressId}`}</h3>
        {modelName ? <p title={modelName}>{modelName}</p> : null}
        {element.description ? <p>{element.description}</p> : null}
      </section>

      <Accordion
        className={styles.group}
        defaultExpanded
        label="Identification"
        titleAs="h4"
      >
        <dl className={styles.values}>
          <div>
            <dt>Nom</dt>
            <dd title={element.name}>{element.name || "—"}</dd>
          </div>
          <div>
            <dt>Type IFC</dt>
            <dd>{element.ifcClass}</dd>
          </div>
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
              <dd title={element.objectType}>{element.objectType}</dd>
            </div>
          ) : null}
          {element.tag ? (
            <div>
              <dt>Repère</dt>
              <dd title={element.tag}>{element.tag}</dd>
            </div>
          ) : null}
        </dl>
      </Accordion>

      <div className={styles.groups}>
        {groups.length ? (
          groups.map((group, index) => (
            <Accordion
              className={styles.group}
              defaultExpanded={index === 0}
              key={`${group.kind}-${group.name}-${index}`}
              label={
                <span className={styles.groupLabel}>
                  <span>
                    <small>{group.kind}</small>
                    <span title={group.name}>{group.name || "Sans nom"}</span>
                  </span>
                  <strong>{group.values.length}</strong>
                </span>
              }
              titleAs="h4"
            >
              <dl className={styles.values}>
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
            </Accordion>
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
