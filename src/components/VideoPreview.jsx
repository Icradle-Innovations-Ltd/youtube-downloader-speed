import React from 'react';

const VideoPreview = ({ videoInfo, translations }) => (
  <section className="card p-6 mb-6">
    <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{videoInfo.title}</h2>
    <img src={videoInfo.thumbnail} alt="Thumbnail" className="rounded-lg mb-4 w-full" />
    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 dark:text-gray-300">
      <p>{translations.duration}: {videoInfo.duration}</p>
      <p>{translations.views}: {(videoInfo.views / 1e6).toFixed(1)}M</p>
      <p>{translations.uploaded}: {videoInfo.uploaded}</p>
      <p>{translations.channel}: {videoInfo.channel}</p>
    </div>
  </section>
);

export default VideoPreview;