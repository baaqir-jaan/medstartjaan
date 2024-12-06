// CCMCalculator.js

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

const CCMCalculator = () => {
  const [data, setData] = useState(null);
  const [npiList, setNpiList] = useState('');
  const [results, setResults] = useState(null);
  const [calcId, setCalcId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  // Example of an initial fetch if needed
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/api/physician`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search_term: 'someNPI', search_type: 'npi' }),
        });

        if (!response.ok) {
          // handle error if desired, or just omit if you don't need this initial fetch
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
    setResults(null); // Clear previous results
    setShowEmailForm(false); // Hide email form during calculation

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

        // Save calc_id for later use
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
            <div className="space-y-4">
              <textarea
                value={npiList}
                onChange={(e) => setNpiList(e.target.value)}
                placeholder="Enter NPI numbers (one per line)"
                className="w-full p-3 border rounded-lg h-32 focus:ring-2 focus:ring-purple-500"
                disabled={loading}
              />

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
                  <h3 cl
