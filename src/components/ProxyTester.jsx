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