import React, { useState } from 'react';

const ProxyTester = ({ proxyConfig, setProxyConfig, translations }) => {
  const [proxyHost, setProxyHost] = useState('');
  const [proxyPort, setProxyPort] = useState('');
  const [testResult, setTestResult] = useState(null);

  const testProxy = async () => {
    try {
      const response = await fetch('/api/test-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxy: { host: proxyHost, port: parseInt(proxyPort) } })
      });
      const result = await response.json();
      setTestResult(result);
      if (result.success) {
        setProxyConfig([...proxyConfig, { host: proxyHost, port: proxyPort }]);
        setProxyHost('');
        setProxyPort('');
      }
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    }
  };

  return (
    <section className="card p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        {translations.proxySettings}
      </h2>
      <div className="mb-4 flex gap-4 items-center">
        <input
          type="text"
          value={proxyHost}
          onChange={(e) => setProxyHost(e.target.value)}
          placeholder="Proxy Host"
          className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
        />
        <input
          type="number"
          value={proxyPort}
          onChange={(e) => setProxyPort(e.target.value)}
          placeholder="Proxy Port"
          className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
        />
        <button onClick={testProxy} className="gradient-bg text-white px-4 py-2 rounded-lg hover:opacity-90">
          {translations.testProxy}
        </button>
      </div>
      {testResult && (
        <div className={`text-sm ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
          {testResult.success ? `Success! IP: ${testResult.ip}, Latency: ${testResult.latency}ms` : `Error: ${testResult.error}`}
        </div>
      )}
    </section>
  );
};

export default ProxyTester;