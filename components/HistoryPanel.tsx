import React, { useState } from 'react';
import type { HistoryItem } from '../types';

interface HistoryPanelProps {
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete?: (item: HistoryItem) => void;
  onClear?: () => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onSelect, onDelete, onClear }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-surface rounded-xl shadow-sm border border-border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center p-4 text-left"
      >
        <h3 className="text-lg font-bold text-foreground">History</h3>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-5 w-5 text-foreground-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-border p-2 max-h-60 overflow-y-auto">
          {history.length === 0 ? (
            <p className="px-2 py-3 text-sm text-foreground-muted">No generations yet.</p>
          ) : (
            <>
              {onClear && (
                <div className="px-2 pb-2">
                  <button
                    type="button"
                    onClick={onClear}
                    className="text-xs text-danger hover:underline"
                  >
                    Clear all history
                  </button>
                </div>
              )}
              <ul className="space-y-1">
                {history.map((item) => (
                  <li key={item.id} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className="flex-1 text-left p-2 rounded-md hover:bg-surface-muted transition-colors"
                    >
                      <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                      <p className="text-xs text-foreground-muted">{item.date}</p>
                    </button>
                    {onDelete && (
                      <button
                        type="button"
                        title="Delete"
                        aria-label={`Delete history item ${item.title}`}
                        onClick={() => onDelete(item)}
                        className="px-2 text-foreground-muted hover:text-danger"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoryPanel;
