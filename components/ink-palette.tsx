import { useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Grid3X3, Plus, X } from "lucide-react";
import { HexColorPicker } from "react-colorful";

export type Swatch = { name: string; value: string };
const pageSize = 12;
const quickSize = 5;

function SwatchButton({ swatch, selected, onClick }: { swatch: Swatch; selected: boolean; onClick: () => void }) {
  return <button type="button" className="swatch" aria-label={swatch.name} data-tooltip={swatch.name} aria-pressed={selected} onClick={onClick}>
    <span style={{ backgroundColor: swatch.value }} />
  </button>;
}

export function InkPalette({ tool, swatches, selected, onSelect, onSave, onRemove }: {
  tool: "pen" | "pencil";
  swatches: Swatch[];
  selected: string;
  onSelect: (color: string) => void;
  onSave: (color: string) => void;
  onRemove: (color?: string) => void;
}) {
  const paletteDialog = useRef<HTMLDialogElement>(null);
  const colorDialog = useRef<HTMLDialogElement>(null);
  const pages = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(selected);
  const [pageIndex, setPageIndex] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const paletteSlots = [null, ...swatches];
  const pageCount = Math.ceil(paletteSlots.length / pageSize);
  const currentPage = Math.min(pageIndex, pageCount - 1);

  const quickSwatches = swatches.slice(0, quickSize);
  const activeSwatch = swatches.find((swatch) => swatch.value === selected);
  if (activeSwatch && !quickSwatches.includes(activeSwatch)) quickSwatches[quickSize - 1] = activeSwatch;

  function selectPage(index: number) {
    const viewport = pages.current;
    if (!viewport) return;
    viewport.scrollLeft = index * viewport.clientWidth;
    setPageIndex(index);
  }

  function openColorPicker() {
    setDraft(selected);
    colorDialog.current?.showModal();
  }

  function submitColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(draft.toLowerCase());
    colorDialog.current?.close();
  }

  return <div className="tool-group swatches" role="group" aria-label={`${tool} colors`}>
    {quickSwatches.map((swatch) => <SwatchButton key={swatch.value} swatch={swatch} selected={swatch.value === selected}
      onClick={() => onSelect(swatch.value)} />)}
    <button type="button" className="swatch add-color" aria-label="Add custom color" aria-haspopup="dialog" data-tooltip="Add color" onClick={openColorPicker}><Plus size={18} /></button>
    <button type="button" className="editor-tool" aria-label="Color palette" aria-haspopup="dialog" data-tooltip="Color palette" onClick={() => {
      paletteDialog.current?.showModal();
      selectPage(0);
    }}><Grid3X3 size={18} /></button>
    <dialog ref={paletteDialog} className="create-dialog" aria-labelledby="palette-title" onClose={() => setConfirmClear(false)}>
      <div className="dialog-header">
        <h2 id="palette-title">Color palette</h2>
        <button type="button" className="icon-button" aria-label="Close color palette" onClick={() => paletteDialog.current?.close()}><X size={21} /></button>
      </div>
      <div ref={pages} className="palette-pages" onScroll={(event) => {
        const { scrollLeft, clientWidth } = event.currentTarget;
        if (clientWidth) setPageIndex(Math.round(scrollLeft / clientWidth));
      }}>
        {Array.from({ length: pageCount }, (_, index) => <div key={index} className="palette-page">
          {paletteSlots.slice(index * pageSize, (index + 1) * pageSize).map((swatch) => <div className="palette-item" key={swatch?.value ?? "add-color"}>
            {swatch ? <>
              <SwatchButton swatch={swatch} selected={swatch.value === selected} onClick={() => {
                onSelect(swatch.value);
                paletteDialog.current?.close();
              }} />
              <button type="button" className="remove-swatch" aria-label={`Delete ${swatch.name}`} onClick={() => onRemove(swatch.value)}><X size={12} /></button>
            </> : <button type="button" className="swatch add-color" aria-label="Add custom color" aria-haspopup="dialog" data-tooltip="Add color" onClick={openColorPicker}><Plus size={18} /></button>}
          </div>)}
        </div>)}
      </div>
      {pageCount > 1 && <nav className="palette-pagination" aria-label="Palette pages">
        <button type="button" className="icon-button" aria-label="Previous palette page" disabled={currentPage === 0} onClick={() => selectPage(currentPage - 1)}><ChevronLeft size={18} /></button>
        <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
        <button type="button" className="icon-button" aria-label="Next palette page" disabled={currentPage + 1 === pageCount} onClick={() => selectPage(currentPage + 1)}><ChevronRight size={18} /></button>
      </nav>}
      {swatches.length > 0 && <div className="palette-footer">
        {confirmClear && <p>Clear every swatch for both Pen and Pencil?</p>}
        <div className="dialog-actions">
          {confirmClear && <button type="button" className="button button-outline" onClick={() => setConfirmClear(false)}>Cancel</button>}
          <button type="button" className="button button-outline palette-delete-all" onClick={() => {
            if (confirmClear) {
              onRemove();
              setConfirmClear(false);
            } else setConfirmClear(true);
          }}>{confirmClear ? "Delete all swatches" : "Delete all"}</button>
        </div>
      </div>}
    </dialog>
    <dialog ref={colorDialog} className="create-dialog color-dialog" aria-label="Add custom color">
      <form onSubmit={submitColor}>
        <HexColorPicker color={draft} onChange={setDraft} />
        <div className="dialog-actions">
          <button type="button" className="button button-outline" onClick={() => colorDialog.current?.close()}>Cancel</button>
          <button className="button button-primary">Save color</button>
        </div>
      </form>
    </dialog>
  </div>;
}
