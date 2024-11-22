#!/bin/bash

# Medicare app shortcuts
alias med='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator"'
alias medf='cd "/Users/baaqiryusuf/Desktop/Medicare Revenue Data Calculator/React Frontend/physician-lookup-frontend"'
alias medback='med && python3 api.py'
alias medfront='medf && npm run dev'
alias medstart='bash /Users/baaqiryusuf/Desktop/Medicare\ Revenue\ Data\ Calculator/start-med.sh'
alias medstop='lsof -ti:8000,5173 | xargs kill -9 2>/dev/null'