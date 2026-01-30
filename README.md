# TheLearningMatrix
Hub for homeschooling resources. Allows custom reports to be sent on schoolwork progress.

## Local development (Python server)

Run the server **from the TheLearningMatrix directory** (the folder that contains `index.html` and `script.js`). If you run it from a parent folder, the browser may request `script.js` from the wrong path and get a 404 HTML page, which causes “Unexpected token ‘<’” in the console and the login form won’t work.

```bash
cd TheLearningMatrix
python3 -m http.server 8000
```

Then open **http://localhost:8000/** (not a subpath). For login to work, the TubularTutor backend must be running (e.g. `npm start` in the TubularTutor repo on port 3000).

## Deployment
- **Frontend:** GitHub Pages (this repo).
- **API:** The backend runs on [Render](https://render.com) (TubularTutor repo). The app calls `https://tubulartutor.onrender.com` when not opened from localhost; for local testing it uses `http://localhost:3000`.
