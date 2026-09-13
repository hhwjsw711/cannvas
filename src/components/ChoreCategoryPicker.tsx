import type { ChoreCategory } from "../data/types";

type ChoreCategoryPickerProps = {
  value: ChoreCategory;
  onChange: (category: ChoreCategory) => void;
};

export function ChoreCategoryPicker({ value, onChange }: ChoreCategoryPickerProps) {
  return (
    <fieldset className="category-picker">
      <legend>家务类别</legend>
      <div>
        <button type="button" className={value === "standard" ? "standard selected" : "standard"} aria-pressed={value === "standard"} onClick={() => onChange("standard")}>
          <strong>日常</strong><span>常规责任</span>
        </button>
        <button type="button" className={value === "bonus" ? "bonus selected" : "bonus"} aria-pressed={value === "bonus"} onClick={() => onChange("bonus")}>
          <strong>奖励</strong><span>额外付费任务</span>
        </button>
      </div>
    </fieldset>
  );
}
