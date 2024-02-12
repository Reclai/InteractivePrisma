// Import required modules
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Create an Express app
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Set the port
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Dynamic retrieval of video files in the public/videos folder
const videosDirectory = path.join(__dirname, 'public', 'videos');
const thumbnailsDirectory = path.join(__dirname, 'public', 'thumbnails');

let videos = fs.readdirSync(videosDirectory);

// Current video index
let currentVideoIndex = 0;

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(videosDirectory, '\\'));
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, thumbnailsDirectory); // Save thumbnails to the thumbnails directory
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

// Endpoint to get the list of videos with last modified dates
app.get('/video-data', (req, res) => {
  fs.readdir(videosDirectory, (err, files) => {
    if (err) {
      console.error('Error reading video directory:', err);
      return res.status(500).send('Error retrieving videos');
    }

    let videoData = files.map(filename => {
      const filepath = path.join(videosDirectory, filename);
      const stats = fs.statSync(filepath);
      return {
        name: filename,
        lastModified: stats.mtime // mtime gives the last modified date
      };
    });

    // Sort videos by last modified date
    videoData.sort((a, b) => b.lastModified - a.lastModified);

    res.json(videoData);
  });
});

const upload = multer({ storage: storage });

// Serve the login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve the control page
app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'video-control.html'));
});


// // Add this route for authentication
// app.post('/authenticate', (req, res) => {
//     const enteredPassword = req.body.password;

//     // Use a basic hardcoded password for demonstration purposes
//     const correctPassword = 'password123'; // Change this to your chosen password

//     if (enteredPassword === correctPassword) {
//       // Authentication successful
//       res.json({ success: true });
//     } else {
//       // Authentication failed
//       res.json({ success: false });
//     }
//   });

const uploadPassword = 'holo'; // Replace with your desired password

app.get('/upload', (req, res) => {
  // Check if the request includes the correct password
  const enteredPassword = req.query.password;
  if (enteredPassword === uploadPassword) {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
  } else {
    // res.status(401).send('Unauthorized');
    res.redirect('/login');
  }
});

// Handle video upload
app.post('/upload', upload.single('videoFile'), (req, res) => {
  // Update the list of videos
  videos = fs.readdirSync(videosDirectory);
  // Broadcast the new video list to all connected clients
  io.emit('videoList', videos);
  res.redirect('/upload?password=holo');
});

// Handle video renaming
app.post('/update-name', (req, res) => {
  const { currentName, newName } = req.body;
  console.log('Received names:', currentName, newName); // Debugging

  // Ensure the currentName and newName are not undefined or empty
  if (!currentName || !newName) {
    return res.status(400).json({ success: false, message: 'Missing currentName or newName in request.' });
  }

  const oldPath = path.join(videosDirectory, currentName);
  const newPath = path.join(videosDirectory, newName);

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error('Error renaming the file:', err);
      return res.status(500).json({ success: false, message: 'Failed to update video name.' });
    }
    res.json({ success: true, message: 'Video name updated successfully.' });
  });
});

// Handle video deletion
app.post('/delete', (req, res) => {
  const videoToDelete = req.body.videoToDelete;
  const videoPath = path.join(videosDirectory, videoToDelete);

  // Delete the video file
  fs.unlinkSync(videoPath);

  // Update the list of videos
  videos = fs.readdirSync(videosDirectory);

  // Broadcast the new video list to all connected clients
  io.emit('videoList', videos);

  res.redirect('/dashboard');
  // res.redirect('/upload?auth=true');
});

// Serve the index page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the Dashboard page
app.get('/dashboard', (req, res) => {
  // Optional: Add authentication check here
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const uploadThumbnail = multer({ storage: thumbnailStorage });

// Handle thumbnail upload
app.post('/upload-thumbnail', uploadThumbnail.single('thumbnail'), (req, res) => {
  // At this point, req.body will be populated with text fields, if any were sent
  // You can access req.file or req.files here along with req.body
  // const videoName = req.body.videoName; // You should have this field in your form now
  // if (!videoName) {
  //   return res.status(400).send('Video name is required.');
  // }
  // const videoFilenameWithoutExtension = videoName.replace(/\.[^/.]+$/, "");
  // const thumbnailFilename = `${videoFilenameWithoutExtension}_thumbnail.png`;
  // const thumbnailPath = path.join(thumbnailsDirectory, thumbnailFilename);
  // fs.renameSync(req.file.path, thumbnailPath);
  console.log('Thumbnail uploaded successfully'); // Add this line for debugging
  res.json({ success: true, message: 'Thumbnail uploaded successfully', filePath: `/thumbnails/${req.file.filename}` });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send the current list of videos to the newly connected client
  socket.emit('videoList', videos);

  const updateClientWithCurrentVideoAndThumbnail = () => {
    if (videos.length > 0) {
      const currentVideo = videos[currentVideoIndex];
      const videoFilenameWithoutExtension = path.basename(currentVideo, path.extname(currentVideo));
      const thumbnailFilename = `${videoFilenameWithoutExtension}_thumbnail.png`;
      const thumbnailPath = `/thumbnails/${thumbnailFilename}`; // Assuming thumbnails are served from /thumbnails

      // Emit both video name and thumbnail path
      console.log(`Emitting thumbnail path: ${thumbnailPath}`); // Add this line for debugging
      socket.emit('currentVideo', { video: currentVideo, thumbnail: thumbnailPath });
    }
  };

  socket.on('nextVideo', () => {
    currentVideoIndex = (currentVideoIndex + 1) % videos.length;
    updateClientWithCurrentVideoAndThumbnail();
  });

  socket.on('prevVideo', () => {
    currentVideoIndex = (currentVideoIndex - 1 + videos.length) % videos.length;
    updateClientWithCurrentVideoAndThumbnail();
  });

  // Call this function to send the current video and thumbnail when a user first connects
  updateClientWithCurrentVideoAndThumbnail();

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
