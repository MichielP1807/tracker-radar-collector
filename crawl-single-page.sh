#!/bin/bash
npm run crawl -- --output ./data/ --verbose --autoconsent-action optIn --data-collectors 'privacySandbox,requests,cmps' --url "https://costco.com/" --force-overwrite