import React from 'react';

const DownloadHistory = ({ history, setUrls, fetchVideoInfo, exportHistory, importCsv, translations }) => (
  <section className="card p-6">
    <div className="collapsible-header p-4 rounded-lg flex justify-between items-center" onClick={() => document.getElementById('history').classList.toggle('hidden')}>
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">📜 {translations.downloadHistory}</h3>
      <div>
        <button onClick={(e) => { e.stopPropagation(); exportHistory(); }} className="text-pink-500 hover:underline mr-4">{translations.export}</button>
        <button onClick={(e) => { e.stopPropagation(); importCsv(); }} className="text-pink-500 hover:underline">{translations.importCsv}</button>
      </div>
    </div>
    <div id="history" className="mt-4">
      <ul className="divide-y dark:divide-gray-700">
        {history.map(({ url, format, timestamp }, index) => (
          <li
            key={index}
            onClick={() => {
              setUrls(url);
              fetchVideoInfo();
            }}
            className="history-item p-4 flex justify-between items-center hover:cursor-pointer"
          >
            <div>
              <span className="text-gray-800 dark:text-gray-200 truncate">{url}</span>
              <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{format}</span>
            </div>
            <span className="text-gray-500 dark:text-gray-400 text-sm">{timestamp}</span>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default DownloadHistory;