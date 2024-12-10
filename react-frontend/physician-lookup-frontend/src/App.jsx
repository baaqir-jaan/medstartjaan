import React, { useState, useEffect } from 'react';
import { DollarSign, Download, Loader, AlertCircle } from 'lucide-react';

const API_URL = "https://medstartjaan.onrender.com";

const CALCULATION_CONSTANTS = {
  averageRevenuePerPatient: 52,
  averageVisitsPerYear: 10,
  profitMargin: 0.45,
  eligiblePatientPercentage: 0.80,
  enrollmentRate: 0.50,
};

const App = () => {
  const [data, setData] = useState(null);
  const [npiList, setNpiList] = useState('');
  const [results, setResults] = useState(null);
  const [calcId, setCalcId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Example initial fetch (optional)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/physician`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search_term: 'someNPI', search_type: 'npi' }),
        });

        if (!response.ok) {
          console.error('Initial fetch failed');
          return;
        }

        const jsonData = await response.json();
        setData(jsonData);
      } catch (err) {
        console.error('Error in initial fetch:', err);
      }
    };
    fetchData();
  }, []);

  const handleCalculate = async () => {
    if (!npiList.trim()) {
      setError('Please enter at least one NPI number');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);
    setShowEmailForm(false);

    try {
      const npiArray = npiList
        .split('\n')
        .map((npi) => npi.trim())
        .filter((npi) => npi !== '');

      let totalPatients = 0;
      let totalEnrolledPatients = 0;
      let notFoundNPIs = [];
      let providerDetails = [];

      for (let npi of npiArray) {
        try {
          const response = await fetch(`${API_URL}/api/physician`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              search_term: npi,
              search_type: 'npi',
            }),
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(errorData || 'Failed to fetch physician data');
          }

          const physicianData = await response.json();

          if (!physicianData) {
            throw new Error('No data found for this NPI');
          }

          const patients = parseInt(physicianData.Tot_Benes) || 0;
          const eligiblePatients = Math.round(
            patients * CALCULATION_CONSTANTS.eligiblePatientPercentage
          );
          const enrolledPatients = Math.round(
            eligiblePatients * CALCULATION_CONSTANTS.enrollmentRate
          );

          totalPatients += patients;
          totalEnrolledPatients += enrolledPatients;

          providerDetails.push({
            name: physicianData.name || 'Unknown Provider',
            npi: physicianData.NPI || npi,
            totalPatients: patients,
          });
        } catch (err) {
          console.error(`Error fetching data for NPI ${npi}:`, err);
          notFoundNPIs.push(npi);
        }
      }

      if (providerDetails.length === 0) {
        throw new Error('No valid NPIs found.');
      }

      const annualRevenue =
        totalEnrolledPatients *
        CALCULATION_CONSTANTS.averageRevenuePerPatient *
        CALCULATION_CONSTANTS.averageVisitsPerYear;

      const annualProfit = annualRevenue * CALCULATION_CONSTANTS.profitMargin;

      const calculationResults = {
        providers: providerDetails,
        totalPatients,
        enrolledPatients: totalEnrolledPatients,
        annualRevenue,
        annualProfit,
        notFoundNPIs,
      };

      // Store calculation results on the backend
      try {
        const storeResponse = await fetch(`${API_URL}/api/store-calculation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calculationResults),
        });

        const { calc_id } = await storeResponse.json();

        setCalcId(calc_id);
      } catch (err) {
        console.error('Error storing calculation data:', err);
        setError('Failed to store calculation data.');
      }

      setResults(calculationResults);
      setShowEmailForm(true);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const fileContent = event.target.result;
        // Assume one NPI per line
        setNpiList(fileContent);
      };
      reader.onerror = () => {
        setError('Failed to read the file. Please try again.');
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white/90 rounded-lg shadow-xl p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 inline-block text-transparent bg-clip-text">
              CCM Profit Calculator
            </h1>
            <p className="text-gray-600 mt-2">
              Calculate your practice's potential revenue from Chronic Care Management
            </p>
          </div>

          <div className="space-y-6">
            {/* Drag and Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed p-4 rounded-lg text-center transition-colors ${
                dragOver ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <p className="text-gray-700">
                Drag & drop a .txt or .csv file with NPIs (one per line) here
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Or simply paste NPIs in the textbox below
              </p>
            </div>

            <div className="space-y-4">
              <textarea
                value={npiList}
                onChange={(e) => setNpiList(e.target.value)}
                placeholder="Enter NPI numbers (one per line)"
                className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />
              <p className="text-sm text-gray-500">
                Note: More NPIs mean more processing time.
              </p>

              <button
                onClick={handleCalculate}
                disabled={loading}
                className="w-full p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader className="animate-spin" /> <span>Calculating...</span>
                  </>
                ) : (
                  <>
                    <DollarSign /> <span>Calculate Potential Revenue</span>
                  </>
                )}
              </button>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center space-x-2 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <p>{error}</p>
                </div>
              )}
            </div>

            {results && (
              <div className="space-y-6">
                {/* Providers Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-700">Providers Found:</h3>
                  <ul className="list-disc list-inside">
                    {results.providers.map((provider, index) => (
                      <li key={index}>
                        {provider.name} (NPI: {provider.npi}) - Patients:{' '}
                        {provider.totalPatients.toLocaleString()}
                      </li>
                    ))}
                  </ul>
                  {results.notFoundNPIs.length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium text-red-600">NPIs Not Found:</h4>
                      <p className="text-sm text-red-600 mb-2">
                        The following NPIs were not found in the CMS database. Please ensure these
                        are correct:
                      </p>
                      <ul className="list-disc list-inside text-red-600">
                        {results.notFoundNPIs.map((npi, index) => (
                          <li key={index}>{npi}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-purple-800">Total Revenue</h3>
                    <p className="text-2xl font-bold text-purple-900">
                      ${Math.round(results.annualRevenue).toLocaleString()}
                    </p>
                    <p className="text-sm text-purple-600">
                      Based on {results.enrolledPatients.toLocaleString()} enrolled patients
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800">Annual Profit</h3>
                    <p className="text-2xl font-bold text-blue-900">
                      ${Math.round(results.annualProfit).toLocaleString()}
                    </p>
                    <p className="text-sm text-blue-600">With turnkey solution</p>
                  </div>
                </div>

                {showEmailForm && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">Get your detailed pro forma breakdown:</p>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          window.location.href = `https://your-hubspot-landing-page.com/?calc_id=${calcId}`;
                        }}
                        className="w-full p-4 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg flex items-center justify-center space-x-2"
                      >
                        <Download className="h-5 w-5" />
                        <span>Get Detailed Pro Forma Report</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;