import React, { useState, useRef, ChangeEvent } from 'react';

interface InputAreaProps {
  onGenerate: (inputText: string, knowledgeBase: string) => void;
  isLoading: boolean;
  isAdoConfigured: boolean;
  integrationsEnabled: boolean;
  onCancel?: () => void;
}

const InputArea: React.FC<InputAreaProps> = ({
  onGenerate,
  isLoading,
  isAdoConfigured,
  integrationsEnabled,
  onCancel,
}) => {
  const [text, setText] = useState<string>('');
  const [knowledgeBase, setKnowledgeBase] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileContent = e.target?.result as string;
        setText(fileContent);
      };
      reader.readAsText(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerate(text, knowledgeBase);
  };

  // Tracker config is required for export, not for generate (review-before-export).
  const isGenerateDisabled = isLoading || !text || !integrationsEnabled;

  const generateTitle = !integrationsEnabled
    ? 'Client integrations disabled — enable only via .env.local for local demos (npm run dev)'
    : !isAdoConfigured
      ? 'You can generate now; configure tracker settings before exporting'
      : '';

  return (
    <div className="bg-surface p-6 rounded-xl shadow-sm border border-border">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
            <label htmlFor="idea-input" className="block text-lg font-medium text-foreground mb-2">
            Your Epic or Business Requirement
            </label>
            <p className="text-sm text-foreground-secondary mb-4">
            Paste your project description, ideas, or upload a document (.txt, .md) to get started.
            </p>
            <textarea
            id="idea-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g., An e-commerce platform for selling custom-designed t-shirts. Users should be able to upload their own designs, choose shirt colors, and see a preview before purchasing..."
            className="w-full h-48 p-4 bg-surface-muted border border-border rounded-lg text-foreground focus:ring-2 focus:ring-accent focus:outline-none transition duration-200"
            disabled={isLoading}
            />
        </div>

        <div>
            <label htmlFor="knowledge-base-input" className="block text-lg font-medium text-foreground mb-2">
             Knowledge Base (Optional)
            </label>
            <p className="text-sm text-foreground-secondary mb-4">
            Manual override / fallback: pasted here when you have not ingested Knowledge Mesh docs,
            or to add extra context on top of retrieved chunks. In API mode, ingest docs in the
            Knowledge Mesh panel for automatic retrieval.
            </p>
            <textarea
            id="knowledge-base-input"
            value={knowledgeBase}
            onChange={(e) => setKnowledgeBase(e.target.value)}
            placeholder="e.g., 'All designs must be checked for copyright infringement. Our payment provider is Stripe. We only ship to the US and Canada.'"
            className="w-full h-24 p-4 bg-surface-muted border border-border rounded-lg text-foreground focus:ring-2 focus:ring-accent focus:outline-none transition duration-200"
            disabled={isLoading}
            />
        </div>


        <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-auto" title={generateTitle}>
            <button
                type="submit"
                disabled={isGenerateDisabled}
                className="w-full sm:w-auto flex-shrink-0 bg-gradient-to-r from-brand-primary to-brand-secondary text-accent-foreground font-semibold py-3 px-8 rounded-lg shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isLoading ? (
                <>
                    <svg className="animate-spin h-5 w-5 text-accent-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Working...
                </>
                ) : (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                    Generate plan
                </>
                )}
            </button>
          </div>
          {isLoading && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto bg-surface-muted text-foreground font-semibold py-3 px-6 rounded-lg border border-border hover:bg-border"
            >
              Cancel
            </button>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".txt,.md"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={triggerFileSelect}
            disabled={isLoading}
            className="w-full sm:w-auto bg-surface-muted text-foreground font-semibold py-3 px-6 rounded-lg border border-border hover:bg-border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface focus:ring-accent transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            Upload Requirement
          </button>
        </div>
      </form>
    </div>
  );
};

export default InputArea;
