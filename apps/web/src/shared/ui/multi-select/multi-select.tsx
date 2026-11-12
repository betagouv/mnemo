"use client";

import { useId, useMemo, useState } from "react";
import useAutocomplete from "@mui/material/useAutocomplete";
import Popper from "@mui/material/Popper";
import Button from "@codegouvfr/react-dsfr/Button";
import styles from "./multi-select.module.css";

export type MultiSelectOption = {
  value: string;
  label: string;
  detail?: string;
};

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Choisir",
  disabled = false,
  autoFocus = false,
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const selected = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );
  const {
    getRootProps,
    getInputLabelProps,
    getInputProps,
    getListboxProps,
    getOptionProps,
    getClearProps,
    getPopupIndicatorProps,
    groupedOptions,
    popupOpen,
    focused,
    anchorEl,
    setAnchorEl,
  } = useAutocomplete({
    id,
    options,
    multiple: true,
    disabled,
    disableCloseOnSelect: true,
    openOnFocus: true,
    autoHighlight: true,
    value: selected,
    inputValue: search,
    onInputChange: (_event, next) => setSearch(next),
    onChange: (_event, next) => {
      onChange(next.map((option) => option.value));
      setSearch("");
    },
    getOptionLabel: (option) => option.label,
    isOptionEqualToValue: (option, selected) => option.value === selected.value,
  });
  const summary = selected.map((option) => option.label).join(", ");
  return (
    <div {...getRootProps()} ref={setAnchorEl} className={styles.root}>
      <label {...getInputLabelProps()} className={`fr-label ${styles.label}`}>
        {label}
      </label>
      <div
        className={`fr-input ${styles.control}`}
        data-disabled={disabled || undefined}
      >
        <input
          {...getInputProps()}
          autoFocus={autoFocus}
          className={styles.input}
          aria-describedby={`${id}-selection`}
          data-selected={selected.length > 0 || undefined}
          placeholder={focused ? "Rechercher…" : summary || placeholder}
        />
        {selected.length ? (
          <>
            <span className={styles.count} aria-hidden="true">
              {selected.length}
            </span>
            <Button
              size="small"
              priority="tertiary no outline"
              iconId="fr-icon-close-line"
              disabled={disabled}
              title={`Vider ${label}`}
              nativeButtonProps={{ ...getClearProps() }}
            />
          </>
        ) : null}
        <Button
          size="small"
          priority="tertiary no outline"
          iconId={
            popupOpen ? "fr-icon-arrow-up-s-line" : "fr-icon-arrow-down-s-line"
          }
          title={`${popupOpen ? "Fermer" : "Ouvrir"} la liste ${label}`}
          disabled={disabled}
          nativeButtonProps={{ ...getPopupIndicatorProps() }}
        />
      </div>
      <span className="fr-sr-only" id={`${id}-selection`} aria-live="polite">
        {selected.length} option{selected.length > 1 ? "s" : ""} sélectionnée
        {selected.length > 1 ? "s" : ""}
        {summary ? `, ${summary}` : ""}
      </span>
      <Popper
        open={popupOpen}
        anchorEl={anchorEl}
        placement="bottom-start"
        className={styles.popper}
        style={{ width: anchorEl?.clientWidth }}
      >
        <div className={styles.popup}>
          {groupedOptions.length ? (
            <ul {...getListboxProps()} className={styles.list}>
              {(groupedOptions as MultiSelectOption[]).map((option, index) => {
                const { key, ...props } = getOptionProps({ option, index });
                return (
                  <li key={key} {...props} className={styles.option}>
                    <span
                      className={`${styles.check} ${value.includes(option.value) ? "fr-icon-check-line" : ""}`}
                      aria-hidden="true"
                    />
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.detail ? (
                      <small aria-hidden="true">{option.detail}</small>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty} role="status">
              Aucun résultat
            </p>
          )}
        </div>
      </Popper>
    </div>
  );
}
