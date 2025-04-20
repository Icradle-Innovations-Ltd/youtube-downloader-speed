import React from 'react';

const DownloadQueue = ({ downloads, pauseDownload, resumeDownload, cancelDownload, translations }) => (
  <section className="card p-6 mb-6">
    <div className="collapsible-header p-4 rounded-lg" onClick={() => document.getElementById('queue').classList.toggle('hidden')}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">📥 {translations.downloadQueue}</h3>
    </div>
    <div id="queue" className="mt-4">
      <ul className="divide-y dark:divide-gray-700">
        {Array.from(downloads.entries()).map(([id, { url, format, progress, priority, status }]) => (
          <li key={id} className="queue-item p-4 flex justify-between items-center">
            <div>
              <span className="text-gray-800 dark:text-gray-200 truncate">{url}</span>
              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{format} (Priority: {priority})</span>
            </div>
            <div className="flex gap-2">
              <span>{progress}% ({status})</span>
              {status !== 'paused' ? (
                <button onClick={() => pauseDownload(id)} className="text-yellow-500 hover:underline">{translations.pause}</button>
              ) : (
                <button onClick={() => resumeDownload(id)} className="text-green-500 hover:underline">{translations.resume}</button>
              )}
              <button onClick={() => cancelDownload(id)} className="text-red-500 hover:underline">{translations.cancel}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default DownloadQueue;