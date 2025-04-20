import React from 'react';

const ErrorDashboard = ({ errors, onClose, translations }) => (
  <section className="card p-6 mb-6 fixed bottom-4 right-4 w-80 z-50">
    <div className="collapsible-header p-4 rounded-lg flex justify-between items-center" onClick={() => document.getElementById('error-dashboard').classList.toggle('hidden')}>
      <h3 className="text-lg font-semibold text-red-500">⚠️ {translations.errorDashboard}</h3>
      <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">{translations.close}</button>
    </div>
    <div id="error-dashboard" className="mt-4">
      <ul className="divide-y dark:divide-gray-700">
        {errors.map((error, index) => (
          <li key={index} className="p-4 text-sm text-red-500">
            {error}
            <button
              onClick={() => {
                // Placeholder for retry logic
                console.log('Retry:', error);
              }}
              className="text-pink-500 hover:underline ml-2"
            >
              Retry
            </button>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default ErrorDashboard;