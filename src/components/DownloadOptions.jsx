import React from 'react';

const DownloadOptions = ({ activeTab, setActiveTab, videoQuality, setVideoQuality, downloads, startDownload, previewFormat, translations }) => {
  const formats = {
    audio: [
      { name: 'MP3 - 320kbps', format: 'mp3-320', size: '8MB' },
      { name: 'MP3 - 128kbps', format: 'mp3-128', size: '3.5MB' }
    ],
    video: [
      { name: 'MP4 4K', format: 'mp4-4K', size: '100MB' },
      { name: 'MP4 1080p', format: 'mp4-1080p', size: '35MB' },
      { name: 'MP4 720p', format: 'mp4-720p', size: '20MB' },
      { name: 'MP4 360p', format: 'mp4-360p', size: '10MB' },
      { name: 'MP4 240p', format: 'mp4-240p', size: '6MB' },
      { name: 'MP4 144p', format: 'mp4-144p', size: '3MB' }
    ],
    other: [
      { name: 'M4A', format: 'm4a', size: '4.8MB' },
      { name: 'WAV', format: 'wav', size: '10MB' },
      { name: 'WEBM', format: 'webm', size: '15MB' },
      { name: 'MKV', format: 'mkv', size: '25MB' }
    ]
  };

  const conversionOptions = ['mp4', 'avi', 'mp3', 'aac'];
  const [selectedConversion, setSelectedConversion] = React.useState('');
  const [uploadToDrive, setUploadToDrive] = React.useState(false);
  const [priority, setPriority] = React.useState(0);

  return (
    <section className="card p-6 mb-6">
      <div className="flex justify-center gap-4 mb-6">
        {['audio', 'video', 'other'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
          >
            {tab === 'audio' ? '🎵 Audio' : tab === 'video' ? '🎥 Video' : '➕ Other'}
          </button>
        ))}
      </div>

      {activeTab === 'video' && (
        <div className="mb-4">
          <label className="text-gray-800 dark:text-gray-200 mr-2">{translations.quality}:</label>
          <select
            value={videoQuality}
            onChange={(e) => setVideoQuality(e.target.value)}
            className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          >
            {['all', '4K', '1080p', '720p', '360p', '240p', '144p'].map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-4 flex gap-4">
        <select
          value={selectedConversion}
          onChange={(e) => setSelectedConversion(e.target.value)}
          className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
        >
          <option value="">{translations.noConversion}</option>
          {conversionOptions.map(opt => (
            <option key={opt} value={opt}>{opt.toUpperCase()}</option>
          ))}
        </select>
        <label className="flex items-center text-gray-800 dark:text-gray-200">
          <input
            type="checkbox"
            checked={uploadToDrive}
            onChange={(e) => setUploadToDrive(e.target.checked)}
            className="mr-2"
          />
          {translations.uploadToDrive}
        </label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          placeholder={translations.priority}
          className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 w-24"
        />
      </div>

      <div className={activeTab !== 'audio' ? 'hidden' : ''}>
        <table className="w-full rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 text-left text-gray-800 dark:text-gray-200">
              <th className="p-4">{translations.format}</th>
              <th className="p-4">{translations.size}</th>
              <th className="p-4">{translations.preview}</th>
              <th className="p-4">{translations.progress}</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {formats.audio.map(({ name, format, size }) => (
              <tr key={format} className="border-b dark:border-gray-700">
                <td className="p-4 text-gray-800 dark:text-gray-200">{name}</td>
                <td className="p-4 text-gray-600 dark:text-gray-300">{size}</td>
                <td className="p-4">
                  <button onClick={() => previewFormat(format)} className="text-pink-500 hover:underline">{translations.play}</button>
                </td>
                <td className="p-4">
                  <div className="progress-bar w-0" style={{ width: `${downloads.get(Array.from(downloads.keys()).find(id => downloads.get(id).format === format))?.progress || 0}%` }}></div>
                </td>
                <td className="p-4">
                  <button
                    onClick={() => startDownload(format, { priority, convertTo: selectedConversion, uploadToDrive })}
                    className="gradient-bg text-white px-4 py-2 rounded-lg hover:opacity-90"
                  >
                    {translations.download}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={activeTab !== 'video' ? 'hidden' : ''}>
        <table className="w-full rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 text-left text-gray-800 dark:text-gray-200">
              <th className="p-4">{translations.format}</th>
              <th className="p-4">{translations.size}</th>
              <th className="p-4">{translations.preview}</th>
              <th className="p-4">{translations.progress}</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {formats.video.filter(({ name }) => videoQuality === 'all' || name.includes(videoQuality)).map(({ name, format, size }) => (
              <tr key={format} className="border-b dark:border-gray-700">
                <td className="p-4 text-gray-800 dark:text-gray-200">{name}</td>
                <td className="p-4 text-gray-600 dark:text-gray-300">{size}</td>
                <td className="p-4">
                  <button onClick={() => previewFormat(format)} className="text-pink-500 hover:underline">{translations.play}</button>
                </td>
                <td className="p-4">
                  <div className="progress-bar w-0" style={{ width: `${downloads.get(Array.from(downloads.keys()).find(id => downloads.get(id).format === format))?.progress || 0}%` }}></div>
                </td>
                <td className="p-4">
                  <button
                    onClick={() => startDownload(format, { priority, convertTo: selectedConversion, uploadToDrive })}
                    className="gradient-bg text-white px-4 py-2 rounded-lg hover:opacity-90"
                  >
                    {translations.download}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={activeTab !== 'other' ? 'hidden' : ''}>
        <table className="w-full rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800 text-left text-gray-800 dark:text-gray-200">
              <th className="p-4">{translations.format}</th>
              <th className="p-4">{translations.size}</th>
              <th className="p-4">{translations.preview}</th>
              <th className="p-4">{translations.progress}</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {formats.other.map(({ name, format, size }) => (
              <tr key={format} className="border-b dark:border-gray-700">
                <td className="p-4 text-gray-800 dark:text-gray-200">{name}</td>
                <td className="p-4 text-gray-600 dark:text-gray-300">{size}</td>
                <td className="p-4">
                  <button onClick={() => previewFormat(format)} className="text-pink-500 hover:underline">{translations.play}</button>
                </td>
                <td className="p-4">
                  <div className="progress-bar w-0" style={{ width: `${downloads.get(Array.from(downloads.keys()).find(id => downloads.get(id).format === format))?.progress || 0}%` }}></div>
                </td>
                <td className="p-4">
                  <button
                    onClick={() => startDownload(format, { priority, convertTo: selectedConversion, uploadToDrive })}
                    className="gradient-bg text-white px-4 py-2 rounded-lg hover:opacity-90"
                  >
                    {translations.download}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default DownloadOptions;