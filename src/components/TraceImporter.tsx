interface TraceImporterProps {
  onPasteImport: (text: string) => void;
  onFileImport: (file: File) => void;
  onLoadSample: (sample: "successful" | "failed") => void;
  onClear: () => void;
  hasTrace: boolean;
}

export default function TraceImporter({ onPasteImport, onFileImport, onLoadSample, onClear, hasTrace }: TraceImporterProps) {
  return (
    <section className="panel importer" aria-labelledby="import-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Input</p>
          <h2 id="import-heading">Import a trace</h2>
        </div>
        <span className="local-pill"><span className="pulse-dot" /> Local only</span>
      </div>
      <div className="sample-actions">
        <button className="button button-primary" type="button" onClick={() => onLoadSample("successful")}>
          <span aria-hidden="true">▶</span> Load Successful Sample
        </button>
        <button className="button button-secondary" type="button" onClick={() => onLoadSample("failed")}>
          <span aria-hidden="true">⚠</span> Load Failed Sample
        </button>
        {hasTrace && <button className="button button-quiet" type="button" onClick={onClear}>Clear trace</button>}
      </div>
      <div className="import-grid">
        <form className="paste-form" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const textarea = form.elements.namedItem("trace-paste");
          if (textarea instanceof HTMLTextAreaElement) onPasteImport(textarea.value);
        }}>
          <label htmlFor="trace-paste">Paste JSON</label>
          <textarea id="trace-paste" name="trace-paste" rows={5} placeholder={'{ "run_id": "...", "events": [] }'} />
          <button className="button button-dark" type="submit">Parse pasted JSON</button>
        </form>
        <div className="upload-box">
          <label htmlFor="trace-file">Upload .json</label>
          <input
            id="trace-file"
            type="file"
            accept=".json,application/json,text/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileImport(file);
              event.target.value = "";
            }}
          />
          <p>JSON files up to 5 MB. Your trace stays in this browser tab.</p>
        </div>
      </div>
    </section>
  );
}
