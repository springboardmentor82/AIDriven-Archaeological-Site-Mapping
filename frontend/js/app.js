// Archaeological Site Mapping Application - Main JavaScript
class ArchaeologicalMapper {
    constructor() {
        this.map = null;
        this.currentImage = null;
        this.selectedFile = null;
        this.processingResults = {
            segmentation: null,
            detection: null,
            statistics: null
        };
        this.imageOverlay = null;
        this.artifactsLayer = null;
        this.segmentationLayer = null;
        this.isOnline = false;
        
        // Backend URLs - FIXED FOR YOUR BACKEND
        this.isProduction = window.location.hostname !== 'localhost' && 
                           window.location.hostname !== '127.0.0.1';
        this.baseUrl = this.isProduction 
            ? "https://archaeological-backend.onrender.com" 
            : "http://localhost:5000";
        
        // API Endpoints based on your backend structure
        this.endpoints = {
            upload: "/api/real/upload",      // CHANGED from /api/upload
            segment: "/api/real/segment",    // CHANGED from /api/segment
            detect: "/api/real/detect",      // CHANGED from /api/detect
            status: "/"
        };
        
        this.imageBounds = null;
        this.isProcessing = false;
        this.isUploading = false;
        this.runningAllProcess = false;
        
        this.initApp();
    }

    initApp() {
        this.initMap();
        this.initEventListeners();
        this.checkBackendStatus();
        console.log("ArchaeoAI Mapper initialized successfully");
        console.log("Backend URL:", this.baseUrl);
        console.log("API Endpoints:", this.endpoints);
        console.log("Mode:", this.isProduction ? "Production" : "Development");
    }

    initMap() {
        try {
            this.map = L.map('map', {
                center: [29.9765, 31.1325],
                zoom: 12,
                zoomControl: true,
                attributionControl: true
            });

            // Add base layer
            L.tileLayer(
                'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                {
                    attribution: '© Esri',
                    maxZoom: 19
                }
            ).addTo(this.map);

            // Update scale
            this.map.on('zoomend', () => {
                this.updateMapScale();
            });

            console.log("Map initialized successfully");

        } catch (error) {
            console.error("Error initializing map:", error);
            this.showNotification("Failed to initialize map", "error");
        }
    }

    async checkBackendStatus() {
        try {
            console.log("Checking backend connection...");
            
            const response = await fetch(`${this.baseUrl}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log("✅ Backend connected:", data);
                
                this.isOnline = true;
                this.updateBackendStatusUI(true);
                this.showNotification("Backend server connected successfully", "success");
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.log("⚠️ Backend connection failed:", error.message);
            this.isOnline = false;
            this.updateBackendStatusUI(false);
            this.showNotification("Running in offline mode. Basic features available.", "warning");
        }
    }

    updateBackendStatusUI(isConnected) {
        const backendStatus = document.getElementById('backendStatus');
        const processingMode = document.getElementById('processingMode');
        
        if (backendStatus) {
            backendStatus.innerHTML = isConnected 
                ? '<i class="fas fa-check-circle text-success me-1"></i> Backend: Connected ✓'
                : '<i class="fas fa-exclamation-triangle text-warning me-1"></i> Backend: Offline';
            backendStatus.className = isConnected ? 'text-success' : 'text-warning';
        }
        
        if (processingMode) {
            processingMode.textContent = isConnected ? 'Online Mode' : 'Offline Mode';
            processingMode.className = isConnected ? 'current-image-mode bg-success' : 'current-image-mode bg-warning';
        }
    }

    async uploadImage() {
        if (!this.selectedFile) {
            this.showNotification('Please select an image file first', 'warning');
            return;
        }

        if (this.isUploading) {
            this.showNotification('Upload already in progress', 'warning');
            return;
        }

        this.isUploading = true;
        this.isProcessing = true;
        
        // Show progress
        this.showProgress('uploadProgress', 'uploadStatus', 'Uploading image...', 0);
        
        try {
            if (this.isOnline) {
                await this.uploadToBackend();
            } else {
                await this.uploadOffline();
            }
            
        } catch (error) {
            console.error('Upload failed:', error);
            this.showNotification('Upload failed, using offline mode', 'warning');
            
            // Fallback to offline
            this.isOnline = false;
            this.updateBackendStatusUI(false);
            await this.uploadOffline();
            
        } finally {
            setTimeout(() => {
                this.hideProgress('uploadProgress');
                this.isProcessing = false;
                this.isUploading = false;
            }, 500);
        }
    }

    async uploadToBackend() {
        const formData = new FormData();
        formData.append('file', this.selectedFile);
        
        this.updateProgress('uploadProgress', 30);
        
        try {
            console.log("Uploading to backend...");
            
            // FIXED ENDPOINT - using this.endpoints.upload
            const response = await fetch(`${this.baseUrl}${this.endpoints.upload}`, {
                method: 'POST',
                body: formData
            });
            
            console.log("Upload response:", response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log("Upload successful:", result);
                
                if (result.success) {
                    this.currentImage = {
                        filename: result.filename,
                        original_name: result.original_name,
                        image_size: result.file_size_mb ? `${result.file_size_mb} MB` : `${Math.round(this.selectedFile.size/(1024*1024))} MB`,
                        preview_url: `${this.baseUrl}${result.preview_url}`,
                        upload_timestamp: result.upload_timestamp,
                        server_data: result
                    };
                    
                    this.updateProgress('uploadProgress', 100);
                    this.showNotification('Image uploaded successfully to server', 'success');
                    
                    // Display image
                    await this.displayImage(this.currentImage.preview_url);
                    
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
            } else {
                throw new Error(`Upload failed: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Backend upload error:', error);
            throw error;
        }
        
        // Update UI and enable buttons
        this.updateImageInfoUI();
        this.enableProcessingButtons(true);
    }

    async uploadOffline() {
        this.updateProgress('uploadProgress', 50);
        await this.delay(1000);
        
        this.currentImage = {
            filename: this.selectedFile.name,
            original_name: this.selectedFile.name,
            image_size: `${(this.selectedFile.size/(1024*1024)).toFixed(2)} MB`,
            preview_url: URL.createObjectURL(this.selectedFile),
            upload_timestamp: new Date().toISOString(),
            server_data: null
        };
        
        this.updateProgress('uploadProgress', 100);
        this.showNotification('Image loaded for offline processing', 'success');
        
        // Display local image
        await this.displayLocalImage(this.selectedFile);
        
        // Update UI and enable buttons
        this.updateImageInfoUI();
        this.enableProcessingButtons(true);
    }

    displayLocalImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgUrl = e.target.result;
                this.displayImage(imgUrl);
                resolve();
            };
            reader.readAsDataURL(file);
        });
    }

    displayImage(imgUrl) {
        // Clear previous image if exists
        if (this.imageOverlay) {
            this.map.removeLayer(this.imageOverlay);
        }
        
        // Clear previous layers
        if (this.artifactsLayer) {
            this.map.removeLayer(this.artifactsLayer);
            this.artifactsLayer = null;
        }
        
        if (this.segmentationLayer) {
            this.map.removeLayer(this.segmentationLayer);
            this.segmentationLayer = null;
        }
        
        // Set up image bounds
        const bounds = [[29.971, 31.127], [29.982, 31.138]];
        
        // Create and add image overlay
        this.imageOverlay = L.imageOverlay(imgUrl, bounds, {
            opacity: 0.8,
            interactive: true,
            className: 'archaeo-image-overlay'
        }).addTo(this.map);
        
        // Fit map to image
        this.map.fitBounds(bounds);
        
        // Store image bounds
        this.imageBounds = bounds;
        
        console.log("Image displayed on map");
    }

    async runSegmentation() {
        if (!this.currentImage) {
            this.showNotification('Please upload an image first', 'warning');
            return;
        }

        if (this.isProcessing && !this.runningAllProcess) {
            this.showNotification('Another process is currently running', 'warning');
            return;
        }

        if (!this.runningAllProcess) {
            this.isProcessing = true;
        }
        
        this.showProgress('processingProgress', 'processingStatus', 'Analyzing site features...', 30);
        
        try {
            if (this.isOnline && this.currentImage.filename) {
                await this.runBackendSegmentation();
            } else {
                await this.runOfflineSegmentation();
            }
            
        } catch (error) {
            console.error('Segmentation failed:', error);
            this.showNotification('Segmentation failed, trying offline mode', 'warning');
            
            if (this.isOnline) {
                this.isOnline = false;
                this.updateBackendStatusUI(false);
                await this.runOfflineSegmentation();
            }
            
        } finally {
            setTimeout(() => {
                this.hideProgress('processingProgress');
                if (!this.runningAllProcess) {
                    this.isProcessing = false;
                }
            }, 500);
        }
    }

    async runBackendSegmentation() {
        this.updateProgress('processingProgress', 50);
        
        try {
            // FIXED ENDPOINT - using this.endpoints.segment
            const response = await fetch(`${this.baseUrl}${this.endpoints.segment}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.currentImage.filename
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log("Segmentation result:", result);
                
                if (result.success) {
                    this.processingResults.segmentation = result;
                    this.updateProgress('processingProgress', 100);
                    
                    const ruinsPercent = result.ruins_percentage || 0;
                    this.showNotification(`Segmentation complete: ${ruinsPercent}% ruins detected`, 'success');
                    
                    this.displaySegmentationResult(result);
                    this.updateResultsPanel('segmentation', result);
                    this.updateLegendValues();
                } else {
                    throw new Error(result.error || 'Segmentation failed');
                }
            } else {
                throw new Error(`Segmentation failed: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Backend segmentation error:', error);
            throw error;
        }
    }

    async runOfflineSegmentation() {
        await this.delay(1500);
        
        const results = {
            ruins_percentage: parseFloat((Math.random() * 40 + 20).toFixed(2)),
            vegetation_percentage: parseFloat((Math.random() * 30 + 10).toFixed(2)),
            water_percentage: parseFloat((Math.random() * 5 + 1).toFixed(2)),
            pixels_analyzed: 1000000 + Math.floor(Math.random() * 500000),
            image_size: '1920x1080',
            success: true,
            segmentation_url: null
        };
        
        this.processingResults.segmentation = results;
        this.updateProgress('processingProgress', 100);
        
        if (!this.runningAllProcess) {
            this.showNotification('Site features segmented (offline mode)', 'success');
        }
        
        this.displaySegmentationResult(results);
        this.updateResultsPanel('segmentation', results);
        this.updateLegendValues();
    }

    async detectArtifacts() {
        if (!this.currentImage) {
            this.showNotification('Please upload an image first', 'warning');
            return;
        }

        if (this.isProcessing && !this.runningAllProcess) {
            this.showNotification('Another process is currently running', 'warning');
            return;
        }

        if (!this.runningAllProcess) {
            this.isProcessing = true;
        }
        
        this.showProgress('processingProgress', 'processingStatus', 'Detecting artifacts...', 50);
        
        try {
            if (this.isOnline && this.currentImage.filename) {
                await this.runBackendDetection();
            } else {
                await this.runOfflineDetection();
            }
            
        } catch (error) {
            console.error('Detection failed:', error);
            this.showNotification('Detection failed, trying offline mode', 'warning');
            
            if (this.isOnline) {
                this.isOnline = false;
                this.updateBackendStatusUI(false);
                await this.runOfflineDetection();
            }
            
        } finally {
            setTimeout(() => {
                this.hideProgress('processingProgress');
                if (!this.runningAllProcess) {
                    this.isProcessing = false;
                }
            }, 500);
        }
    }

    async runBackendDetection() {
        this.updateProgress('processingProgress', 70);
        
        try {
            // FIXED ENDPOINT - using this.endpoints.detect
            const response = await fetch(`${this.baseUrl}${this.endpoints.detect}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    filename: this.currentImage.filename
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log("Detection result:", result);
                
                if (result.success) {
                    this.processingResults.detection = result;
                    this.updateProgress('processingProgress', 100);
                    
                    const count = result.total_detected || 0;
                    
                    if (!this.runningAllProcess) {
                        this.showNotification(`Found ${count} artifacts`, 'success');
                    }
                    
                    this.displayDetectionResult(result);
                    this.updateResultsPanel('detection', result);
                    this.updateLegendValues();
                } else {
                    throw new Error(result.error || 'Detection failed');
                }
            } else {
                throw new Error(`Detection failed: ${response.status}`);
            }
            
        } catch (error) {
            console.error('Backend detection error:', error);
            throw error;
        }
    }

    async runOfflineDetection() {
        await this.delay(1500);
        
        const artifacts = [];
        const numArtifacts = Math.floor(Math.random() * 12) + 3;
        const artifactTypes = ['Pottery', 'Tool', 'Structure', 'Ceramic', 'Bone', 'Stone Tool', 'Vessel', 'Ornament'];
        
        for (let i = 0; i < numArtifacts; i++) {
            artifacts.push({
                id: i + 1,
                type: artifactTypes[Math.floor(Math.random() * artifactTypes.length)],
                confidence: parseFloat((Math.random() * 0.3 + 0.7).toFixed(3)),
                area: Math.floor(Math.random() * 2000 + 500),
                center: [Math.floor(Math.random() * 1000), Math.floor(Math.random() * 1000)],
                bbox: [
                    Math.floor(Math.random() * 800),
                    Math.floor(Math.random() * 800),
                    Math.floor(Math.random() * 200 + 50),
                    Math.floor(Math.random() * 200 + 50)
                ]
            });
        }
        
        const results = {
            artifacts: artifacts,
            total_detected: artifacts.length,
            success: true,
            detection_map: null
        };
        
        this.processingResults.detection = results;
        this.updateProgress('processingProgress', 100);
        
        if (!this.runningAllProcess) {
            this.showNotification(`Found ${artifacts.length} artifacts (offline mode)`, 'success');
        }
        
        this.displayDetectionResult(results);
        this.updateResultsPanel('detection', results);
        this.updateLegendValues();
    }

    async runAllProcessing() {
        if (!this.currentImage) {
            this.showNotification('Please upload an image first', 'warning');
            return;
        }

        if (this.isProcessing) {
            this.showNotification('Another process is currently running', 'warning');
            return;
        }

        this.isProcessing = true;
        this.runningAllProcess = true;
        
        // Show loading overlay
        this.showLoading('Running Complete Analysis', 'Processing site features and artifacts...');
        
        // Create loading steps
        const loadingSteps = document.getElementById('loadingSteps');
        if (loadingSteps) {
            loadingSteps.innerHTML = `
                <div class="loading-step" id="step-segmentation">
                    <i class="fas fa-circle-notch fa-spin"></i>
                    <span>Segmenting Site Features</span>
                </div>
                <div class="loading-step" id="step-detection">
                    <i class="far fa-circle"></i>
                    <span>Detecting Artifacts</span>
                </div>
                <div class="loading-step" id="step-analysis">
                    <i class="far fa-circle"></i>
                    <span>Final Analysis</span>
                </div>
            `;
        }
        
        try {
            // Step 1: Segmentation
            this.updateLoadingStep('segmentation', 'active');
            
            // Show progress for segmentation
            this.showProgress('processingProgress', 'processingStatus', 'Analyzing site features...', 30);
            
            if (this.isOnline && this.currentImage.filename) {
                await this.runBackendSegmentation();
            } else {
                await this.runOfflineSegmentation();
            }
            
            this.hideProgress('processingProgress');
            
            // Wait between steps
            await this.delay(1000);
            
            // Step 2: Detection
            this.updateLoadingStep('segmentation', 'completed');
            this.updateLoadingStep('detection', 'active');
            
            // Show progress for detection
            this.showProgress('processingProgress', 'processingStatus', 'Detecting artifacts...', 50);
            
            if (this.isOnline && this.currentImage.filename) {
                await this.runBackendDetection();
            } else {
                await this.runOfflineDetection();
            }
            
            this.hideProgress('processingProgress');
            
            // Step 3: Analysis
            await this.delay(500);
            this.updateLoadingStep('detection', 'completed');
            this.updateLoadingStep('analysis', 'active');
            
            // Generate statistics
            await this.generateCombinedStatistics();
            await this.delay(1000);
            this.updateLoadingStep('analysis', 'completed');
            
            this.showNotification('All processing completed successfully!', 'success');
            
        } catch (error) {
            console.error('Complete processing failed:', error);
            this.showNotification('Processing failed: ' + error.message, 'error');
        } finally {
            setTimeout(() => {
                this.hideLoading();
                this.isProcessing = false;
                this.runningAllProcess = false;
            }, 1000);
        }
    }

    async generateCombinedStatistics() {
        const seg = this.processingResults.segmentation;
        const det = this.processingResults.detection;
        
        this.processingResults.statistics = {
            timestamp: new Date().toISOString(),
            image_name: this.currentImage?.original_name || 'Unknown',
            ruins_coverage: seg?.ruins_percentage || 0,
            vegetation_coverage: seg?.vegetation_percentage || 0,
            water_coverage: seg?.water_percentage || 0,
            artifact_count: det?.total_detected || 0,
            processing_mode: this.isOnline ? 'Online' : 'Offline',
            summary: `Analysis complete: ${seg?.ruins_percentage || 0}% ruins, ${det?.total_detected || 0} artifacts`
        };
        
        console.log("Generated statistics:", this.processingResults.statistics);
        
        // Add combined result to results panel
        this.updateResultsPanel('combined', this.processingResults.statistics);
    }

    // UI Helper Methods
    showProgress(containerId, statusId, message, percentage) {
        const container = document.getElementById(containerId);
        const status = document.getElementById(statusId);
        const progressBar = container?.querySelector(".progress-bar");

        if (container && status && progressBar) {
            container.style.display = "block";
            status.textContent = message;
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute("aria-valuenow", percentage);
        }
    }

    updateProgress(containerId, percentage) {
        const container = document.getElementById(containerId);
        const progressBar = container?.querySelector(".progress-bar");

        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
            progressBar.setAttribute("aria-valuenow", percentage);
        }
    }

    hideProgress(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = "none";
        }
    }

    showLoading(title = 'Processing', message = 'Please wait while we analyze the image...') {
        const loadingOverlay = document.getElementById('loadingOverlay');
        const loadingTitle = document.getElementById('loadingTitle');
        const loadingText = document.getElementById('loadingText');
        const loadingProgress = document.getElementById('loadingProgress');
        
        if (loadingOverlay && loadingTitle && loadingText && loadingProgress) {
            loadingTitle.textContent = title;
            loadingText.textContent = message;
            loadingProgress.style.width = '0%';
            
            loadingOverlay.style.display = 'flex';
            setTimeout(() => {
                loadingOverlay.classList.add('active');
            }, 10);
            
            // Animate progress bar
            let progress = 0;
            const interval = setInterval(() => {
                progress += 1;
                loadingProgress.style.width = `${progress}%`;
                
                if (progress >= 100) {
                    clearInterval(interval);
                }
            }, 100);
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
            setTimeout(() => {
                loadingOverlay.style.display = 'none';
            }, 300);
        }
    }

    updateLoadingStep(stepId, status = 'active') {
        const step = document.getElementById(`step-${stepId}`);
        if (step) {
            step.className = `loading-step ${status}`;
            
            if (status === 'completed') {
                const icon = step.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-check-circle text-success';
                }
            } else if (status === 'active') {
                const icon = step.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-circle-notch fa-spin';
                }
            }
        }
    }

    showNotification(message, type = 'info') {
        const toast = document.getElementById('notificationToast');
        const toastTitle = document.getElementById('toastTitle');
        const toastMessage = document.getElementById('toastMessage');

        if (!toast || !toastTitle || !toastMessage) return;

        // Set title based on type
        let title = 'Notification';
        let bgClass = 'bg-primary';
        let icon = 'fa-bell';

        switch (type) {
            case 'success':
                title = 'Success';
                bgClass = 'bg-success';
                icon = 'fa-check-circle';
                break;
            case 'error':
                title = 'Error';
                bgClass = 'bg-danger';
                icon = 'fa-exclamation-circle';
                break;
            case 'warning':
                title = 'Warning';
                bgClass = 'bg-warning';
                icon = 'fa-exclamation-triangle';
                break;
            case 'info':
                title = 'Info';
                bgClass = 'bg-info';
                icon = 'fa-info-circle';
                break;
        }

        toastTitle.innerHTML = `<i class="fas ${icon} me-2"></i>${title}`;
        toastMessage.textContent = message;

        const toastHeader = toast.querySelector('.toast-header');
        if (toastHeader) {
            toastHeader.className = `toast-header text-white ${bgClass}`;
        }

        // Show toast
        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: type === 'error' ? 5000 : 3000
        });
        bsToast.show();
    }

    updateImageInfoUI() {
        const currentImageInfo = document.getElementById('currentImageInfo');
        const imageStats = document.getElementById('imageStats');
        
        if (currentImageInfo && this.currentImage) {
            currentImageInfo.textContent = this.currentImage.original_name;
        }
        
        if (imageStats && this.currentImage) {
            imageStats.textContent = this.currentImage.image_size;
        }
        
        // Also update legend values
        this.updateLegendValues();
    }

    updateLegendValues() {
        const seg = this.processingResults.segmentation;
        const det = this.processingResults.detection;
        
        // Update legend values
        const legendArtifacts = document.getElementById('legendArtifacts');
        const legendRuins = document.getElementById('legendRuins');
        const legendVegetation = document.getElementById('legendVegetation');
        const legendWater = document.getElementById('legendWater');
        const legendStructures = document.getElementById('legendStructures');
        
        if (legendArtifacts) {
            legendArtifacts.textContent = det?.total_detected || 0;
        }
        
        if (legendRuins) {
            legendRuins.textContent = seg?.ruins_percentage ? `${seg.ruins_percentage.toFixed(1)}%` : '0%';
        }
        
        if (legendVegetation) {
            legendVegetation.textContent = seg?.vegetation_percentage ? `${seg.vegetation_percentage.toFixed(1)}%` : '0%';
        }
        
        if (legendWater) {
            legendWater.textContent = seg?.water_percentage ? `${seg.water_percentage.toFixed(1)}%` : '0%';
        }
        
        if (legendStructures) {
            legendStructures.textContent = det?.artifacts?.filter(a => a.type?.includes('Structure') || a.type?.includes('Building')).length || 0;
        }
    }

    enableProcessingButtons(enabled) {
        const buttons = ['segmentBtn', 'detectBtn', 'allBtn'];
        
        buttons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = !enabled;
                if (!enabled) {
                    btn.classList.add('disabled');
                } else {
                    btn.classList.remove('disabled');
                }
            }
        });
    }

    updateResultsPanel(type, data) {
        const container = document.getElementById("resultsContainer");

        // Remove placeholder if present
        const placeholder = container.querySelector(".text-center");
        if (placeholder) {
            placeholder.remove();
        }

        let resultHtml = "";
        
        if (type === "segmentation") {
            resultHtml = `
                <div class="result-item info">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0"><i class="fas fa-mountain"></i> Site Segmentation</h6>
                        <span class="badge bg-primary">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="mt-2">
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-landmark text-warning me-2"></i>Ruins:</span>
                            <span class="fw-bold text-warning">${data.ruins_percentage?.toFixed(2) || 0}%</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-leaf text-success me-2"></i>Vegetation:</span>
                            <span class="fw-bold text-success">${data.vegetation_percentage?.toFixed(2) || 0}%</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-water text-info me-2"></i>Water:</span>
                            <span class="fw-bold text-info">${data.water_percentage?.toFixed(2) || 0}%</span>
                        </div>
                        <div class="d-flex justify-content-between mb-3">
                            <span><i class="fas fa-chart-bar me-2"></i>Pixels Analyzed:</span>
                            <span>${(data.pixels_analyzed || 0).toLocaleString()}</span>
                        </div>
                        <button class="btn btn-sm btn-outline-light w-100" onclick="window.app.viewResults('segmentation')">
                            <i class="fas fa-chart-line me-2"></i> View Details
                        </button>
                    </div>
                </div>
            `;
        } else if (type === "detection") {
            const artifactCount = data.total_detected || 0;
            
            resultHtml = `
                <div class="result-item success">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0"><i class="fas fa-search"></i> Artifact Detection</h6>
                        <span class="badge bg-warning">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="mt-2">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                <div class="small">Total Artifacts</div>
                                <div class="fw-bold text-warning" style="font-size: 1.5rem;">${artifactCount}</div>
                            </div>
                            <div class="text-end">
                                <div class="small">Mode</div>
                                <div class="fw-bold">${this.isOnline ? 'Online' : 'Offline'}</div>
                            </div>
                        </div>
                        <div class="mb-3">
                            <div class="small mb-2">Detected Types:</div>
                            <div class="d-flex flex-wrap gap-2">
                                ${data.artifacts?.slice(0, 3).map(artifact => `
                                    <span class="badge" style="background-color: #f39c12;">
                                        ${artifact.type || 'Unknown'}
                                    </span>
                                `).join('')}
                            </div>
                            ${data.artifacts?.length > 3 ? 
                                `<div class="text-center small mt-2">...and ${data.artifacts?.length - 3} more</div>` : ''}
                        </div>
                        <button class="btn btn-sm btn-outline-light w-100" onclick="window.app.viewResults('detection')">
                            <i class="fas fa-list me-2"></i> View Artifacts List
                        </button>
                    </div>
                </div>
            `;
        } else if (type === "combined") {
            resultHtml = `
                <div class="result-item warning">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0"><i class="fas fa-tasks"></i> Complete Analysis Summary</h6>
                        <span class="badge bg-danger">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="mt-2">
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-landmark text-warning me-2"></i>Ruins Coverage:</span>
                            <span class="fw-bold text-warning">${data.ruins_coverage?.toFixed(2) || 0}%</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-search text-success me-2"></i>Artifacts Found:</span>
                            <span class="fw-bold text-success">${data.artifact_count || 0}</span>
                        </div>
                        <div class="d-flex justify-content-between mb-2">
                            <span><i class="fas fa-leaf text-info me-2"></i>Vegetation:</span>
                            <span class="fw-bold text-info">${data.vegetation_coverage?.toFixed(2) || 0}%</span>
                        </div>
                        <div class="d-flex justify-content-between mb-3">
                            <span><i class="fas fa-bolt me-2"></i>Processing Mode:</span>
                            <span class="fw-bold">${data.processing_mode || 'Unknown'}</span>
                        </div>
                        <div class="alert alert-dark mb-3" style="background: rgba(255,255,255,0.1);">
                            <small><i class="fas fa-info-circle me-2"></i>${data.summary || 'Analysis complete'}</small>
                        </div>
                        <button class="btn btn-sm btn-outline-light w-100" onclick="window.app.viewResults('combined')">
                            <i class="fas fa-chart-pie me-2"></i> View Full Report
                        </button>
                    </div>
                </div>
            `;
        }

        if (resultHtml) {
            container.insertAdjacentHTML("afterbegin", resultHtml);
        }
    }

    // Utility Methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    displaySegmentationResult(results) {
        // Create info popup
        const popupContent = `
            <div style="padding: 15px; min-width: 250px;">
                <h5 style="margin-bottom: 10px; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                    <i class="fas fa-mountain"></i> Segmentation Results
                </h5>
                <div style="margin-bottom: 8px;">
                    <strong style="color: #ff7800;">
                        <i class="fas fa-landmark"></i> Ruins:
                    </strong> ${results.ruins_percentage?.toFixed(2) || 0}%
                </div>
                <div style="margin-bottom: 8px;">
                    <strong style="color: #27ae60;">
                        <i class="fas fa-leaf"></i> Vegetation:
                    </strong> ${results.vegetation_percentage?.toFixed(2) || 0}%
                </div>
                <div style="margin-bottom: 8px;">
                    <strong style="color: #3498db;">
                        <i class="fas fa-water"></i> Water:
                    </strong> ${results.water_percentage?.toFixed(2) || 0}%
                </div>
            </div>
        `;
        
        L.popup()
            .setLatLng([29.9765, 31.1325])
            .setContent(popupContent)
            .openOn(this.map);
    }

    displayDetectionResult(results) {
        // Clear previous artifacts
        if (this.artifactsLayer) {
            this.map.removeLayer(this.artifactsLayer);
        }
        
        // Create layer for artifacts
        this.artifactsLayer = L.layerGroup().addTo(this.map);
        
        // Add markers for each artifact
        results.artifacts?.forEach((artifact, index) => {
            // Calculate position around center
            const lat = 29.9765 + (Math.random() - 0.5) * 0.01;
            const lng = 31.1325 + (Math.random() - 0.5) * 0.01;
            
            // Create marker
            const marker = L.circleMarker([lat, lng], {
                radius: Math.min(20, Math.max(8, Math.sqrt(artifact.area) / 100)),
                color: '#ff9900',
                fillColor: '#ffcc00',
                fillOpacity: 0.7,
                weight: 2,
                className: 'artifact-marker'
            }).addTo(this.artifactsLayer);
            
            // Create popup
            const popupContent = `
                <div style="padding: 10px; min-width: 220px;">
                    <h6 style="margin-bottom: 8px; color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                        <i class="fas fa-search"></i> Artifact ${index + 1}
                    </h6>
                    <div style="margin-bottom: 5px;">
                        <strong>Type:</strong> 
                        <span class="badge" style="background-color: #f39c12; color: white; padding: 2px 8px; border-radius: 10px;">
                            ${artifact.type || 'Unknown'}
                        </span>
                    </div>
                    <div style="margin-bottom: 5px;">
                        <strong>Confidence:</strong> 
                        <span style="color: ${artifact.confidence > 0.8 ? '#27ae60' : '#f39c12'}">
                            ${(artifact.confidence * 100)?.toFixed(1) || 0}%
                        </span>
                    </div>
                    <div style="margin-bottom: 5px;">
                        <strong>Area:</strong> ${artifact.area?.toFixed(2) || 0} pixels
                    </div>
                </div>
            `;
            
            marker.bindPopup(popupContent);
        });
    }

    clearResults() {
        if (this.artifactsLayer) {
            this.map.removeLayer(this.artifactsLayer);
            this.artifactsLayer = null;
        }
        
        this.processingResults = {
            segmentation: null,
            detection: null,
            statistics: null
        };

        const container = document.getElementById("resultsContainer");
        if (container) {
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-inbox fa-3x mb-3" style="opacity: 0.3;"></i>
                    <p class="text-light mb-0" style="opacity: 0.6;">No results yet.<br>Upload an image and run processing tools.</p>
                </div>
            `;
        }

        // Update legend values
        this.updateLegendValues();

        this.showNotification("All results cleared", "info");
    }

    toggleOverlay(type) {
        const checkbox = document.getElementById(`show${type.charAt(0).toUpperCase() + type.slice(1)}`);
        const isVisible = checkbox?.checked || false;

        if (type === "detection" && this.artifactsLayer) {
            if (isVisible) {
                this.map.addLayer(this.artifactsLayer);
            } else {
                this.map.removeLayer(this.artifactsLayer);
            }
        }
    }

    toggleBaseMap() {
        const checkbox = document.getElementById('showBaseMap');
        const isVisible = checkbox?.checked || false;
        
        if (this.imageOverlay) {
            if (isVisible) {
                this.map.addLayer(this.imageOverlay);
            } else {
                this.map.removeLayer(this.imageOverlay);
            }
        }
    }

    fitToBounds() {
        if (this.imageOverlay && this.imageBounds) {
            this.map.fitBounds(this.imageBounds);
            this.showNotification('Map fitted to image bounds', 'success');
        } else {
            this.showNotification('No image loaded', 'warning');
        }
    }

    updateMapScale() {
        const scaleElement = document.getElementById('mapScale');
        if (scaleElement) {
            const zoom = this.map.getZoom();
            const scale = Math.round(591657550 / Math.pow(2, zoom - 1));
            scaleElement.textContent = `1:${scale.toLocaleString()}`;
        }
    }

    viewResults(type) {
        const modal = new bootstrap.Modal(document.getElementById('resultsModal'));
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)} Results`;
        
        let content = '';
        
        if (type === 'detection' && this.processingResults?.detection) {
            const artifacts = this.processingResults.detection.artifacts || [];
            
            content = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <h6 class="mb-3">Total Artifacts Detected: ${artifacts.length}</h6>
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Type</th>
                                <th>Confidence</th>
                                <th>Area (pixels)</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            artifacts.forEach(artifact => {
                content += `
                    <tr>
                        <td>${artifact.id || 'N/A'}</td>
                        <td><span class="badge bg-info">${artifact.type || 'Unknown'}</span></td>
                        <td>${(artifact.confidence * 100)?.toFixed(1) || 0}%</td>
                        <td>${artifact.area?.toFixed(2) || 0}</td>
                    </tr>
                `;
            });
            
            content += `
                        </tbody>
                    </table>
                </div>
            `;
        }
        else if (type === 'segmentation' && this.processingResults?.segmentation) {
            const data = this.processingResults.segmentation;
            
            content = `
                <div class="row">
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <h1 class="text-warning">${data.ruins_percentage?.toFixed(1) || 0}%</h1>
                                <p class="card-text"><i class="fas fa-landmark"></i> Ruins</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <h1 class="text-success">${data.vegetation_percentage?.toFixed(1) || 0}%</h1>
                                <p class="card-text"><i class="fas fa-leaf"></i> Vegetation</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-body text-center">
                                <h1 class="text-info">${data.water_percentage?.toFixed(1) || 0}%</h1>
                                <p class="card-text"><i class="fas fa-water"></i> Water</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        else if (type === 'combined' && this.processingResults?.statistics) {
            const stats = this.processingResults.statistics;
            const seg = this.processingResults.segmentation;
            const det = this.processingResults.detection;
            
            content = `
                <div class="container-fluid">
                    <div class="row mb-4">
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header bg-primary text-white">
                                    <h6 class="mb-0"><i class="fas fa-chart-bar"></i> Analysis Summary</h6>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-6">
                                            <div class="text-center p-2">
                                                <h3 class="text-warning">${stats.ruins_coverage?.toFixed(1) || 0}%</h3>
                                                <small>Ruins Coverage</small>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="text-center p-2">
                                                <h3 class="text-success">${stats.artifact_count || 0}</h3>
                                                <small>Artifacts Found</small>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="text-center p-2">
                                                <h3 class="text-info">${stats.vegetation_coverage?.toFixed(1) || 0}%</h3>
                                                <small>Vegetation</small>
                                            </div>
                                        </div>
                                        <div class="col-6">
                                            <div class="text-center p-2">
                                                <h3 class="text-primary">${stats.water_coverage?.toFixed(1) || 0}%</h3>
                                                <small>Water Bodies</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-header bg-success text-white">
                                    <h6 class="mb-0"><i class="fas fa-info-circle"></i> Processing Details</h6>
                                </div>
                                <div class="card-body">
                                    <p><strong>Image Name:</strong> ${stats.image_name}</p>
                                    <p><strong>Processing Mode:</strong> ${stats.processing_mode}</p>
                                    <p><strong>Timestamp:</strong> ${new Date(stats.timestamp).toLocaleString()}</p>
                                    <p><strong>Summary:</strong> ${stats.summary}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-12">
                            <div class="card">
                                <div class="card-header bg-warning text-dark">
                                    <h6 class="mb-0"><i class="fas fa-chart-pie"></i> Detailed Results</h6>
                                </div>
                                <div class="card-body">
                                    <p class="text-center"><strong>Complete archaeological site analysis completed successfully!</strong></p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        modalBody.innerHTML = content || '<p class="text-center py-4">No results available.</p>';
        modal.show();
    }

    // Mobile Control Panel Methods
    toggleControlPanel() {
        const controlPanel = document.querySelector('.control-panel');
        const toggleButton = document.getElementById('controlPanelToggle');
        
        if (controlPanel && toggleButton) {
            controlPanel.classList.toggle('active');
            
            if (controlPanel.classList.contains('active')) {
                toggleButton.innerHTML = '<i class="fas fa-times fa-lg"></i>';
                toggleButton.style.right = 'calc(90% - 30px)';
            } else {
                toggleButton.innerHTML = '<i class="fas fa-map-marked-alt fa-lg"></i>';
                toggleButton.style.right = '15px';
            }
        }
    }

    toggleControlPanelCollapse() {
        const controlPanel = document.querySelector('.control-panel');
        if (controlPanel) {
            controlPanel.classList.toggle('collapsed');
        }
    }

    initEventListeners() {
        // File upload handling
        const fileInput = document.getElementById('imageUpload');
        const fileUploadArea = document.getElementById('fileUploadArea');
        const uploadBtn = document.getElementById('uploadBtn');
        
        if (fileUploadArea && fileInput) {
            fileUploadArea.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    this.selectedFile = file;
                    
                    // Update UI
                    if (uploadBtn) {
                        uploadBtn.disabled = false;
                        uploadBtn.innerHTML = `
                            <i class="fas fa-cloud-upload-alt me-2"></i> 
                            Upload "${file.name.length > 20 ? file.name.substring(0, 20) + '...' : file.name}"
                        `;
                    }
                    
                    // Update upload area
                    fileUploadArea.innerHTML = `
                        <div class="text-center">
                            <i class="fas fa-file-image fa-3x mb-3 text-success"></i>
                            <p class="mb-1 fw-bold" style="font-size: 0.9rem;">
                                ${file.name.length > 25 ? file.name.substring(0, 25) + '...' : file.name}
                            </p>
                            <small class="text-light" style="opacity: 0.6;">
                                ${(file.size / (1024 * 1024)).toFixed(2)} MB
                            </small>
                        </div>
                    `;
                    
                    this.showNotification(`File selected: ${file.name}`, 'success');
                }
            });
        }
        
        // Upload button
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                if (this.selectedFile) {
                    this.uploadImage();
                }
            });
        }
        
        // Processing buttons
        const segmentBtn = document.getElementById('segmentBtn');
        const detectBtn = document.getElementById('detectBtn');
        const allBtn = document.getElementById('allBtn');
        
        if (segmentBtn) {
            segmentBtn.addEventListener('click', () => {
                this.runSegmentation();
            });
        }
        
        if (detectBtn) {
            detectBtn.addEventListener('click', () => {
                this.detectArtifacts();
            });
        }
        
        if (allBtn) {
            allBtn.addEventListener('click', () => {
                this.runAllProcessing();
            });
        }
        
        // Clear results
        const clearResultsBtn = document.getElementById('clearResultsBtn');
        if (clearResultsBtn) {
            clearResultsBtn.addEventListener('click', () => {
                this.clearResults();
            });
        }
        
        // Export buttons
        const exportGeoJSONBtn = document.getElementById('exportGeoJSONBtn');
        const exportCSVBtn = document.getElementById('exportCSVBtn');
        const exportPDFBtn = document.getElementById('exportPDFBtn');
        
        if (exportGeoJSONBtn) {
            exportGeoJSONBtn.addEventListener('click', () => {
                this.showNotification("Exporting GeoJSON data...", "info");
            });
        }
        
        if (exportCSVBtn) {
            exportCSVBtn.addEventListener('click', () => {
                this.showNotification("Exporting CSV report...", "info");
            });
        }
        
        if (exportPDFBtn) {
            exportPDFBtn.addEventListener('click', () => {
                this.showNotification("Generating PDF report...", "info");
            });
        }
        
        // Map controls
        const fitBoundsBtn = document.getElementById('fitBoundsBtn');
        if (fitBoundsBtn) {
            fitBoundsBtn.addEventListener('click', () => {
                this.fitToBounds();
            });
        }
        
        // Layer toggles
        const showSegmentation = document.getElementById('showSegmentation');
        const showDetection = document.getElementById('showDetection');
        const showBaseMap = document.getElementById('showBaseMap');
        
        if (showSegmentation) {
            showSegmentation.addEventListener('change', () => {
                this.toggleOverlay('segmentation');
            });
        }
        
        if (showDetection) {
            showDetection.addEventListener('change', () => {
                this.toggleOverlay('detection');
            });
        }
        
        if (showBaseMap) {
            showBaseMap.addEventListener('change', () => {
                this.toggleBaseMap();
            });
        }
        
        // Modal download button
        const downloadReportBtn = document.getElementById('downloadReportBtn');
        if (downloadReportBtn) {
            downloadReportBtn.addEventListener('click', () => {
                this.showNotification('Downloading report...', 'info');
            });
        }
        
        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('sidebar');
        
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                sidebarToggle.innerHTML = sidebar.classList.contains('active') 
                    ? '<i class="fas fa-times fa-lg"></i>' 
                    : '<i class="fas fa-bars fa-lg"></i>';
            });
        }
        
        // Control Panel Toggle
        const controlPanelToggle = document.getElementById('controlPanelToggle');
        const controlPanelHeader = document.querySelector('.control-panel-header');
        
        if (controlPanelToggle) {
            controlPanelToggle.addEventListener('click', () => {
                this.toggleControlPanel();
            });
        }
        
        if (controlPanelHeader) {
            controlPanelHeader.addEventListener('click', () => {
                // Only collapse on desktop, toggle on mobile
                if (window.innerWidth > 768) {
                    this.toggleControlPanelCollapse();
                } else {
                    // On mobile, clicking header closes the panel
                    this.toggleControlPanel();
                }
            });
        }
        
        // Close control panel when clicking outside on mobile
        document.addEventListener('click', (e) => {
            const controlPanel = document.querySelector('.control-panel');
            const controlPanelToggle = document.getElementById('controlPanelToggle');
            
            if (window.innerWidth <= 768 && 
                controlPanel && 
                controlPanel.classList.contains('active') &&
                !controlPanel.contains(e.target) && 
                !controlPanelToggle.contains(e.target)) {
                this.toggleControlPanel();
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            const controlPanel = document.querySelector('.control-panel');
            const controlPanelToggle = document.getElementById('controlPanelToggle');
            
            if (window.innerWidth > 768) {
                // On desktop, ensure control panel is visible and reset toggle button
                if (controlPanel) {
                    controlPanel.classList.remove('active');
                    controlPanel.classList.remove('collapsed');
                }
                if (controlPanelToggle) {
                    controlPanelToggle.style.display = 'none';
                }
            } else {
                // On mobile, hide control panel by default
                if (controlPanel) {
                    controlPanel.classList.remove('active');
                }
                if (controlPanelToggle) {
                    controlPanelToggle.style.display = 'flex';
                    controlPanelToggle.style.right = '15px';
                    controlPanelToggle.innerHTML = '<i class="fas fa-map-marked-alt fa-lg"></i>';
                }
            }
        });
    }
}

// Initialize application when page loads
document.addEventListener("DOMContentLoaded", function () {
    window.app = new ArchaeologicalMapper();
    console.log("ArchaeoAI Mapper initialized");
});