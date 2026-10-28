import { useState } from 'react';
export function DiscoverJobs() {
  const [title,setTitle] = useState('');
  return <section aria-label="Discover opportunities"><label>Job title<input value={title} onChange={event => setTitle(event.target.value)} /></label></section>;
}
