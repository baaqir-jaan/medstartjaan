/**
 * Physician Medicare Data Lookup Application
 * 
 * This application allows users to:
 * 1. Search for physicians by name or NPI
 * 2. Filter by state
 * 3. Upload files with multiple physicians
 * 4. Input multiple physician names manually
 * 5. Create financial models with CCM revenue projections
 * 6. Export models to CSV or PDF
 * 7. Save and manage multiple models
 * 8. Calculate profit based on adjustable assumptions
 */


import React, { useState, useCallback, useEffect } from 'react';
import { 
  Upload, 
  Search, 
  FileText, 
  AlertCircle, 
  Loader, 
  PlusCircle, 
  Download, 
  Save, 
  Edit, 
  Trash2,
  DollarSign,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';
import html2pdf from 'html2pdf.js';
import './App.css'; // Import custom CSS for animations and styling


// State abbreviations for dropdown
const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// Default financial model assumptions
const DEFAULT_ASSUMPTIONS = {
  traditionalMedicarePercent: 75,
  medicareAdvantagePercent: 25,
  eligibleForCCMPercent: 80,
  enrolledPercent: 40,
  billableEventsPerYear: 10,
  revenuePerEvent: 50,
  profitPercentage: 35 // New assumption
};

const App = () => {
  /**
   * State Management
   * - Core application states for search and results
   * - Financial model states
   * - UI state management
   */
  
  // Search and Results States
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [searchType, setSearchType] = useState('name');

  // Bulk Name Input State
  const [bulkNames, setBulkNames] = useState('');

  // File Upload States
  const [dragActive, setDragActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  // Financial Model States
  const [modelList, setModelList] = useState([]);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [savedModels, setSavedModels] = useState([]);
  const [editingAssumptions, setEditingAssumptions] = useState(false);
  const [calculateProfit, setCalculateProfit] = useState(false);

  /**
   * Financial Calculations
   * Calculates all metrics for the financial model based on 
   * physician data and current assumptions
   */
  const calculateFinancialMetrics = useCallback((physician) => {
    // Traditional MCR Patients (ACTUAL) is directly from input
    const traditionalMCR = physician.Tot_Benes;

    // Estimated Traditional MCR + MA Patients
    const estimatedTraditional = Math.round(traditionalMCR * 1.33);

    // Calculate enrolled patients based on assumptions
    const patientsEnrolled = Math.round(
      estimatedTraditional * 
      (assumptions.eligibleForCCMPercent / 100) * 
      (assumptions.enrolledPercent / 100)
    );

    // Calculate CCM Revenue
    const ccmRevenue = patientsEnrolled * 
      assumptions.billableEventsPerYear * 
      assumptions.revenuePerEvent;

    // Current MCR amount
    const currentMCR = Number(physician.Tot_Mdcr_Alowd_Amt);

    // Calculate totals and changes
    const projectedTotal = currentMCR + ccmRevenue;
    const change = projectedTotal - currentMCR;
    const percentIncrease = ((change / currentMCR) * 100).toFixed(1);

    // Calculate profit
    const profit = calculateProfit ? (projectedTotal * assumptions.profitPercentage / 100) : null;

    return {
      ...physician,
      traditionalMCR,
      estimatedTraditional,
      patientsEnrolled,
      ccmRevenue,
      currentMCR,
      projectedTotal,
      change,
      percentIncrease,
      profit
    };
  }, [assumptions, calculateProfit]);

  /**
   * Recalculate Model List when assumptions or calculateProfit change
   */
  const recalculateModelList = useCallback(() => {
    setModelList((prevList) => prevList.map(calculateFinancialMetrics));
  }, [calculateFinancialMetrics]);

  // Recalculate when assumptions or calculateProfit change
  useEffect(() => {
    recalculateModelList();
  }, [assumptions, calculateProfit, recalculateModelList]);

  /**
   * Calculate totals for all metrics across the model
   */
  const calculateTotals = () => {
    return modelList.reduce((acc, curr) => ({
      traditionalMCR: acc.traditionalMCR + curr.traditionalMCR,
      estimatedTraditional: acc.estimatedTraditional + curr.estimatedTraditional,
      patientsEnrolled: acc.patientsEnrolled + curr.patientsEnrolled,
      ccmRevenue: acc.ccmRevenue + curr.ccmRevenue,
      Tot_Mdcr_Alowd_Amt: acc.Tot_Mdcr_Alowd_Amt + Number(curr.Tot_Mdcr_Alowd_Amt),
      projectedTotal: acc.projectedTotal + curr.projectedTotal,
      change: acc.change + curr.change,
      profit: acc.profit + (curr.profit || 0)
    }), {
      traditionalMCR: 0,
      estimatedTraditional: 0,
      patientsEnrolled: 0,
      ccmRevenue: 0,
      Tot_Mdcr_Alowd_Amt: 0,
      projectedTotal: 0,
      change: 0,
      profit: 0
    });
  };

  // Calculate totals for current model
  const totals = calculateTotals();

  /**
   * Search Functionality
   * Handles single physician lookups by name or NPI
   */
  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setError(`Please enter a ${searchType === 'name' ? 'physician name' : 'NPI number'}`);
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/physician', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          search_term: searchTerm,
          state: selectedState || undefined,
          search_type: searchType
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData);
      }

      const data = await response.json();
      if (data) {
        setResults([data]);
      } else {
        setError(`No results found for this ${searchType === 'name' ? 'physician' : 'NPI'}`);
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Bulk Name Input Functionality
   */
  const handleBulkSearch = async () => {
    if (!bulkNames.trim()) {
      setError('Please enter at least one physician name');
      return;
    }

    setLoading(true);
    setError('');
    setProcessingStatus('Processing physicians...');

    try {
      const namesArray = bulkNames
        .split('\n')
        .map(name => name.trim())
        .filter(name => name);

      const response = await fetch('/api/physicians/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          names: namesArray,
          state: selectedState || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData);
      }

      const data = await response.json();
      if (data.length === 0) {
        setError('No matching physicians found');
      } else {
        setResults(data);
        setProcessingStatus(`Found ${data.length} physicians`);
      }
    } catch (err) {
      setError(`Error processing names: ${err.message}`);
      setProcessingStatus('');
    } finally {
      setLoading(false);
    }
  };

  /**
   * File Upload Handlers
   * Manages drag-and-drop and file input functionality
   */
  const processFile = async (file) => {
    setLoading(true);
    setError('');
    setProcessingStatus('Reading file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setProcessingStatus('Processing physicians...');

        const response = await fetch('/api/physicians/bulk_file', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: e.target.result,
            state: selectedState || undefined
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(errorData);
        }

        const data = await response.json();
        if (data.length === 0) {
          setError('No matching physicians found');
        } else {
          setResults(data);
          setProcessingStatus(`Found ${data.length} physicians`);
        }
      } catch (err) {
        setError(`Error processing file: ${err.message}`);
        setProcessingStatus('');
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  /**
   * Model Management Functions
   * Handles adding/removing physicians and saving models
   */
  const handleAddToModel = (physician) => {
    if (!modelList.find(p => p.NPI === physician.NPI)) {
      const updatedList = [...modelList, calculateFinancialMetrics(physician)];
      setModelList(updatedList);
    }
  };

  const handleRemoveFromModel = (npi) => {
    setModelList(modelList.filter(p => p.NPI !== npi));
  };

  const handleSaveModel = () => {
    const modelName = prompt("Enter a name for this model:");
    if (modelName) {
      setSavedModels([...savedModels, {
        name: modelName,
        date: new Date(),
        physicians: modelList,
        assumptions: {...assumptions}
      }]);
    }
  };

  /**
   * Export Functions
   * Handles exporting to CSV and PDF
   */
  const exportToCSV = () => {
    const headers = [
      "First Name",
      "Last Name",
      "Suffix",
      "NPI Number",
      "Traditional MCR Patients",
      "Estimated Traditional MCR + MA Patients",
      "Phamily Benchmark - Patients Enrolled in CCM",
      "CCM Revenue / Year",
      "Total MCR Allowed Amt",
      "Projected Total Traditional MCR",
      "Change in Traditional MCR Revenue w/ CCM",
      "Proj. % Revenue Increase w/ CCM",
      ...(calculateProfit ? ["Profit"] : [])
    ];

    const csvData = [
      headers.join(","),
      ...modelList.map(p => [
        p.name.split(" ")[0],
        p.name.split(" ").slice(1).join(" "),
        p.Suffix || "",
        p.NPI,
        p.traditionalMCR,
        p.estimatedTraditional,
        p.patientsEnrolled,
        p.ccmRevenue,
        p.Tot_Mdcr_Alowd_Amt,
        p.projectedTotal,
        p.change,
        p.percentIncrease,
        ...(calculateProfit ? [p.profit] : [])
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'financial-model.csv';
    a.click();
  };

  const exportToPDF = () => {
    const element = document.getElementById('financial-model-content');
    
    const opt = {
      margin: 10,
      filename: `phamily-ccm-financial-model-${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true
      },
      jsPDF: { 
        unit: 'mm', 
        format: 'a4', 
        orientation: 'landscape'
      }
    };

    // Remove any remove buttons before generating PDF
    const removeButtons = element.querySelectorAll('.remove-button');
    removeButtons.forEach(button => button.style.display = 'none');
    
    html2pdf().set(opt).from(element).save().then(() => {
      // Restore remove buttons after PDF generation
      removeButtons.forEach(button => button.style.display = '');
    });
  };

  /**
   * Main Application Render
   * Includes all UI components and layout structure
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Search Card */}
        <Card className="backdrop-blur-lg bg-white/90 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 inline-block text-transparent bg-clip-text">
              Physician Medicare Data Lookup
            </CardTitle>
          </CardHeader>
          <div className="relative">
  
          
  {/* Main Content */}
  <div className="ml-72">
    {/* Your main card content goes here */}
  </div>
</div>


          {/* Guide Text for the Application */}
          <div className="guide-text" style={{ padding: '1.5rem', margin: '1rem 0', borderRadius: '10px', backgroundColor: '#f4f6ff', color: '#555', lineHeight: '1.6', boxShadow: '0px 4px 10px rgba(0, 0, 0, 0.05)' }}>
            <h2 style={{ color: '#4e54c8', fontWeight: 'bold', fontSize: '1.4rem', marginBottom: '0.8rem' }}>
              Welcome to the Physician Medicare Data Lookup Tool
            </h2>
            <p>
              Designed for healthcare professionals, financial analysts, and business managers, this tool streamlines the process of gathering Medicare data on physicians nationwide.
              With intuitive search options, bulk data upload capabilities, and powerful financial modeling features, you can gain insights quickly, make informed decisions,
              and maximize revenue opportunities.
            </p>
            <h3 style={{ color: '#4e54c8', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '1rem' }}>Key Features</h3>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
              <li><strong>Single Search:</strong> Find Medicare data on individual physicians by entering a name or NPI and selecting a state if applicable.</li>
              <li><strong>Bulk Search:</strong> Enter a list of physician names to retrieve Medicare data in seconds, perfect for managing large datasets.</li>
              <li><strong>File Upload:</strong> Drag and drop files with physician names to upload data in bulk and generate insights quickly.</li>
              <li><strong>Financial Modeling:</strong> Use built-in calculators to create revenue projections, estimate profit, and assess CCM revenue potential.</li>
            </ul>
            <p style={{ color: '#555', marginTop: '1rem' }}>
              Get started by using the search box to look up physician data or upload a list for bulk processing. With just a few clicks, you can save, export, and analyze
              Medicare data, making your workflow faster, smarter, and more efficient.
            </p>
          </div>

          <CardContent>
            <div className="space-y-6">
              {/* Search Controls */}
              <div className="flex items-center space-x-4 mb-4">
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value)}
                  className="p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 flex-1"
                  disabled={loading}
                >
                  <option value="name">Search by Name</option>
                  <option value="npi">Search by NPI</option>
                </select>
                
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 flex-1"
                  disabled={loading}
                >
                  <option value="">All States</option>
                  {STATES.map(state => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>

              {/* Search Input and Button */}
              <div className="flex space-x-4">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={searchType === 'name' ? "Enter physician name" : "Enter NPI number"}
                  className="flex-1 p-3 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  disabled={loading}
                />
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg flex items-center space-x-2 disabled:opacity-50 hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
                >
                  {loading ? (
                    <Loader className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                  <span>{loading ? 'Searching...' : 'Search'}</span>
                </button>
              </div>

              {/* Bulk Name Input Area */}
              <div className="mt-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Bulk Name Input</h2>
                <textarea
                  value={bulkNames}
                  onChange={(e) => setBulkNames(e.target.value)}
                  placeholder="Enter one physician name per line"
                  className="w-full p-3 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  rows={5}
                  disabled={loading}
                />
                <button
                  onClick={handleBulkSearch}
                  disabled={loading || !bulkNames.trim()}
                  className="mt-4 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg flex items-center space-x-2 disabled:opacity-50 hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg"
                >
                  {loading ? (
                    <Loader className="h-5 w-5 animate-spin" />
                  ) : (
                    <Search className="h-5 w-5" />
                  )}
                  <span>{loading ? 'Searching...' : 'Search Names'}</span>
                </button>
              </div>

              {/* File Upload Area */}
              <div 
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
                  ${dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-500'}
                  ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  onChange={handleFileInput}
                  className="hidden"
                  accept=".txt"
                  disabled={loading}
                  id="file-upload"
                />
                <label 
                  htmlFor="file-upload"
                  className="flex flex-col items-center justify-center space-y-2 cursor-pointer"
                >
                  <Upload className={`h-8 w-8 ${dragActive ? 'text-purple-500' : 'text-gray-400'}`} />
                  <span className="text-sm text-gray-600">
                    {dragActive ? 'Drop your file here' : 'Drag and drop your file here, or click to browse'}
                  </span>
                </label>
                {processingStatus && (
                  <div className="mt-2 text-sm text-purple-600 flex items-center justify-center space-x-2">
                    {loading ? <Loader className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    <span>{processingStatus}</span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <Alert variant="destructive" className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              )}

              {/* Search Results */}
              {results.length > 0 && (
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NPI</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Beneficiaries</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medicare Allowed Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.map((result, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{result.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{result.NPI}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{result.State}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{result.Tot_Benes}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {typeof result.Tot_Mdcr_Alowd_Amt === 'number' 
                              ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD'
                                }).format(result.Tot_Mdcr_Alowd_Amt)
                              : result.Tot_Mdcr_Alowd_Amt
                            }
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <button
                              onClick={() => handleAddToModel(result)}
                              disabled={modelList.some(p => p.NPI === result.NPI)}
                              className="flex items-center space-x-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <PlusCircle size={14} />
                              <span>{modelList.some(p => p.NPI === result.NPI) ? 'Added' : 'Add to Model'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Financial Model Card */}
        <Card className="backdrop-blur-lg bg-white/90 shadow-xl">
          <CardHeader className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 inline-block text-transparent bg-clip-text">
              Financial Model
            </CardTitle>
            <div className="flex space-x-2">
              <button
                onClick={() => setEditingAssumptions(true)}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 flex items-center space-x-1"
              >
                <Edit size={16} />
                <span>Edit Assumptions</span>
              </button>
              <button
                onClick={handleSaveModel}
                className="px-3 py-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 flex items-center space-x-1"
              >
                <Save size={16} />
                <span>Save Model</span>
              </button>
              <button
                onClick={exportToCSV}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 flex items-center space-x-1"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
              <button
                onClick={exportToPDF}
                className="px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200 flex items-center space-x-1"
              >
                <FileText size={16} />
                <span>Export PDF</span>
              </button>
              <button
                onClick={() => setCalculateProfit(!calculateProfit)}
                className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full hover:bg-yellow-200 flex items-center space-x-1"
              >
                <DollarSign size={16} />
                <span>{calculateProfit ? 'Hide Profit' : 'Calculate Profit'}</span>
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Model Results Table */}
            <div id="financial-model-content" className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 bg-white rounded-lg shadow-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NPI</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Traditional MCR Patients</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estimated Traditional + MA Patients</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patients Enrolled in CCM</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CCM Revenue / Year</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Medicare Allowed Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projected Total Medicare Revenue</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Change in Revenue</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Projected % Revenue Increase</th>
                    {calculateProfit && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-green-700 uppercase tracking-wider animate-fade-in">
                        Profit
                      </th>
                    )}
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {modelList.map((physician, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{physician.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{physician.NPI}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{physician.traditionalMCR}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{physician.estimatedTraditional}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{physician.patientsEnrolled}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(physician.ccmRevenue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(physician.currentMCR)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(physician.projectedTotal)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(physician.change)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{physician.percentIncrease}%</td>
                      {calculateProfit && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-green-700 bg-green-50 animate-fade-in">
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD'
                          }).format(physician.profit)}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <button
                          onClick={() => handleRemoveFromModel(physician.NPI)}
                          className="remove-button flex items-center space-x-1 px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200"
                        >
                          <Trash2 size={14} />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totals Row */}
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">Totals</td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4 text-sm text-gray-900">{totals.traditionalMCR}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{totals.estimatedTraditional}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{totals.patientsEnrolled}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                      }).format(totals.ccmRevenue)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                      }).format(totals.Tot_Mdcr_Alowd_Amt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                      }).format(totals.projectedTotal)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                      }).format(totals.change)}
                    </td>
                    <td className="px-6 py-4"></td>
                    {calculateProfit && (
                      <td className="px-6 py-4 text-sm text-green-700 font-semibold bg-green-50 animate-fade-in">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(totals.profit)}
                      </td>
                    )}
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Saved Models Section */}
        {savedModels.length > 0 && (
          <Card className="backdrop-blur-lg bg-white/90 shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 inline-block text-transparent bg-clip-text">
                Saved Models
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {savedModels.map((model, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                      <p className="text-sm text-gray-600">Saved on {model.date.toLocaleDateString()}</p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setModelList(model.physicians);
                          setAssumptions(model.assumptions);
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 flex items-center space-x-1"
                      >
                        <Edit size={16} />
                        <span>Load Model</span>
                      </button>
                      <button
                        onClick={() => {
                          setSavedModels(savedModels.filter((_, i) => i !== index));
                        }}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-full hover:bg-red-200 flex items-center space-x-1"
                      >
                        <Trash2 size={16} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assumptions Modal */}
        {editingAssumptions && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Edit Assumptions</h2>
              <div className="space-y-4">
                {Object.keys(assumptions).map((key) => (
                  <div key={key} className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </label>
                    <input
                      type="number"
                      value={assumptions[key]}
                      onChange={(e) => setAssumptions({
                        ...assumptions,
                        [key]: Number(e.target.value)
                      })}
                      className="w-24 p-2 border rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    />
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end space-x-2">
                <button
                  onClick={() => setEditingAssumptions(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setEditingAssumptions(false);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;
