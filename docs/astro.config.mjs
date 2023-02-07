import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwind from '@astrojs/tailwind';

/** @type {import('@types/astro').AstroUserConfig} */
export default defineConfig({
	trailingSlash: 'always',
	integrations: [tailwind(), mdx()],
});
