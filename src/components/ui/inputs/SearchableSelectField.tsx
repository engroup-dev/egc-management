import React, { useState, useRef, useEffect } from "react";
import { Search, Check } from "lucide-react";

type Option = { value: string; label: string };

type BaseProps = {
  id: string;
  label?: string;
  placeholder?: string;
  error?: { message?: string };
  options: Option[];
  loading?: boolean;
  disabled?: boolean;
  hideLabel?: boolean;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value?: string;
  onChange?: (value: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  values: string[];
  onChange?: (values: string[]) => void;
};

type SearchableSelectFieldProps = SingleProps | MultiProps;

export const SearchableSelectField: React.FC<SearchableSelectFieldProps> = (
  props,
) => {
  const {
    id,
    label,
    placeholder = "-- اختر --",
    error,
    options,
    loading,
    disabled = false,
    hideLabel = false,
  } = props;
  const multiple = props.multiple === true;

  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = React.useMemo(() => {
    if (loading) return [];
    if (!searchValue) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [options, searchValue, loading]);

  // Single-select: keep deriving the shown label from the current value.
  useEffect(() => {
    if (multiple) return;
    const singleValue = (props as SingleProps).value;
    if (singleValue) {
      const selected = options.find((opt) => opt.value === singleValue);
      setSelectedLabel(selected?.label || "");
    } else {
      setSelectedLabel("");
    }
  }, [multiple, props, options]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchValue("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (option: Option) => {
    if (multiple) {
      const current = (props as MultiProps).values ?? [];
      const next = current.includes(option.value)
        ? current.filter((v) => v !== option.value)
        : [...current, option.value];
      (props as MultiProps).onChange?.(next);
      return;
    }
    (props as SingleProps).onChange?.(option.value);
    setSelectedLabel(option.label);
    setIsOpen(false);
    setSearchValue("");
  };

  const triggerLabel = (() => {
    if (multiple) {
      const values = (props as MultiProps).values ?? [];
      if (values.length === 0) return placeholder;
      if (values.length === 1) {
        const only = options.find((o) => o.value === values[0]);
        return only?.label || placeholder;
      }
      return `${values.length} محدد`;
    }
    return selectedLabel || placeholder;
  })();

  const isSelected = (optionValue: string) => {
    if (multiple) return ((props as MultiProps).values ?? []).includes(optionValue);
    return (props as SingleProps).value === optionValue;
  };

  return (
    <div className="flex flex-col">
      {!hideLabel && label && (
        <label htmlFor={id} className="mb-1 text-sm text-foreground">
          {label}
        </label>
      )}

      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full border rounded px-3 py-2 text-right bg-white focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {triggerLabel}
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg overflow-hidden">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  disabled={loading || disabled}
                  placeholder="ابحث..."
                  className="w-full pr-10 pl-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500">
                  جاري التحميل...
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-gray-500">
                  لا توجد نتائج
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = isSelected(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={`w-full flex items-center justify-between text-right px-3 py-2 hover:bg-gray-100 ${
                        selected ? "bg-gray-50" : ""
                      }`}
                    >
                      <span>{option.label}</span>
                      {multiple && selected && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-error mt-1">{error.message}</p>}
    </div>
  );
};
