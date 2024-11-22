import React, { useState, useCallback } from 'react';
import { Upload, Search, FileText, AlertCircle, Loader, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from './components/ui/card';
import { Alert, AlertDescription } from './components/ui/alert';

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const DEFAULT_ASSUMPTIONS = {
  traditionalMedicarePercent: 75,
  medicareAdvantagePercent: 25,
  eligibleForCCMPercent: 80,
  enrolledPercent: 40,
  billableEventsPerYear: 10,
  revenuePerEvent: 50
};

const App = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [searchType, setSearchType] = useState('name');
  const [dragActive, setDragActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  // New state variables for financial model
  const [modelList, setModelList] = useState([]);
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);
  const [editingAssumptions, setEditingAssumptions] = useState(false);

  const calculateFinancialMetrics = (physician) => {
    const traditionalMCR = physician.Tot_Benes * (assumptions.traditionalMedicarePercent / 100);
    const estimatedTraditional = Math.round(traditionalMCR * 1.33);
    const patientsEligible = Math.round(estimatedTraditional * (assumptions.eligibleForCCMPercent / 100));
    const patientsEnrolled = Math.round(patientsEligible * (assumptions.enrolledPercent / 100));
    const ccmRevenue = patientsEnrolled * assumptions.billableEventsPerYear * assumptions.revenuePerEvent;
    const projectedTotal = Number(physician.Tot_Mdcr_Alowd_Amt) + ccmRevenue;
    const change = projectedTotal - Number(physician.Tot_Mdcr_Alowd_Amt);
    const percentIncrease = ((change / Number(physician.Tot_Mdcr_Alowd_Amt)) * 100).toFixed(1);

    return {
      
      ...physician,
      traditionalMCR,
      estimatedTraditional,
      patientsEligible,
      patientsEnrolled,
      ccmRevenue,
      projectedTotal,
      change,
      percentIncrease
    };
  };

  const handleAddToModel = (physician) => {
    if (!modelList.find(p => p.NPI === physician.NPI)) {
      const updatedList = [...modelList, calculateFinancialMetrics(physician)];
      setModelList(updatedList);
    }
  };

  const handleRemoveFromModel = (npi) => {
    setModelList(modelList.filter(p => p.NPI !== npi));
  };


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

  const processFile = async (file) => {
    setLoading(true);
    setError('');
    setProcessingStatus('Reading file...');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        setProcessingStatus('Processing physicians...');
        
        const response = await fetch('/api/physicians/bulk', {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 p-6">
      <div className="max-w-4xl mx-auto">
        <Card className="backdrop-blur-lg bg-white/90 shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 inline-block text-transparent bg-clip-text">
              Physician Medicare Data Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
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

              {error && (
                <Alert variant="destructive" className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600">{error}</AlertDescription>
                </Alert>
              )}

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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default App;