export function missionHead(title: string, description: string) {
  return { meta: [{ title: `${title} | AMANAR` }, { name: 'description', content: description }, { property: 'og:title', content: `${title} | AMANAR` }, { property: 'og:description', content: description }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }] };
}