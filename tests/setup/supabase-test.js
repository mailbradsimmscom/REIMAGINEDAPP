// tests/setup/supabase-test.js
// Supabase testing utilities for your Replit environment

import { createClient } from '@supabase/supabase-js';

// Use environment variables (set in Replit Secrets)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing Supabase credentials in environment variables');
  console.log('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Replit Secrets');
}

export const testSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// Test data for consistent testing
export const TEST_BOAT_DATA = {
  boat_systems: [
    {
      id: 'test-gps-system',
      boat_id: 'test-boat-1',
      brand: 'Garmin',
      model: 'GPSMap 8612xsv',
      category: 'navigation',
      installation_date: '2023-05-15',
      notes: 'Primary navigation system',
      specifications: JSON.stringify({
        screen_size: '12_inch',
        features: ['gps', 'chartplotter', 'sonar']
      })
    },
    {
      id: 'test-watermaker-system',
      boat_id: 'test-boat-1',
      brand: 'Spectra',
      model: 'Newport 400E',
      category: 'water_systems', 
      installation_date: '2023-06-01',
      notes: 'Main watermaker system',
      specifications: JSON.stringify({
        capacity: '6_gph',
        filter_type: '5_micron'
      })
    }
  ],

  assets_v2: [
    {
      asset_uid: 'test-asset-gps',
      tab: 'navigation',
      Manufacturer: 'Garmin',
      Description: 'GPSMap 8612xsv Multi-function Display with GPS chartplotter',
      model: 'GPSMap 8612xsv',
      enrich_model_key: 'garmin-gpsmap-8612xsv',
      quantity_per_model_key: 1,
      instance_index: 1
    },
    {
      asset_uid: 'test-asset-watermaker',
      tab: 'water_systems',
      Manufacturer: 'Spectra',
      Description: 'Newport 400E Watermaker with 5 micron pre-filter',
      model: 'Newport 400E',
      enrich_model_key: 'spectra-newport-400e',
      quantity_per_model_key: 1,
      instance_index: 1
    }
  ],

  playbooks_v2: [
    {
      id: 'test-pb-gps-cal',
      group: 'navigation',
      manufacturer: 'Garmin',
      model: 'GPSMap 8612xsv',
      model_key: 'garmin-gpsmap-8612xsv',
      playbook_title: 'GPS Calibration Procedure',
      routing_matchers: JSON.stringify(['gps', 'calibration', 'garmin']),
      routing_triggers: JSON.stringify(['calibrate gps', 'gps setup']),
      safety_note: 'Ensure vessel is stationary during calibration',
      priority: 1
    }
  ]
};

// Clean up test data (be careful - only delete test records!)
export async function cleanupTestData() {
  try {
    // Only delete records that start with 'test-'
    await testSupabase.from('boat_systems').delete().like('id', 'test-%');
    await testSupabase.from('assets_v2').delete().like('asset_uid', 'test-%');
    await testSupabase.from('playbooks_v2').delete().like('id', 'test-%');

    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('❌ Error cleaning test data:', error.message);
  }
}

// Insert test data
export async function setupTestData() {
  try {
    // Clean first
    await cleanupTestData();

    // Insert test boat systems
    const { error: systemError } = await testSupabase
      .from('boat_systems')
      .insert(TEST_BOAT_DATA.boat_systems);

    if (systemError) throw systemError;

    // Insert test assets
    const { error: assetError } = await testSupabase
      .from('assets_v2')
      .insert(TEST_BOAT_DATA.assets_v2);

    if (assetError) throw assetError;

    // Insert test playbooks
    const { error: playbookError } = await testSupabase
      .from('playbooks_v2')
      .insert(TEST_BOAT_DATA.playbooks_v2);

    if (playbookError) throw playbookError;

    console.log('✅ Test data set up successfully');
    return true;
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    return false;
  }
}

// Verify test data exists
export async function verifyTestData() {
  try {
    const { data: systems } = await testSupabase
      .from('boat_systems')
      .select('*')
      .like('id', 'test-%');

    const { data: assets } = await testSupabase
      .from('assets_v2')
      .select('*')
      .like('asset_uid', 'test-%');

    console.log(`Test data status: ${systems?.length || 0} boat_systems, ${assets?.length || 0} assets`);
    return { systems: systems?.length || 0, assets: assets?.length || 0 };
  } catch (error) {
    console.error('Error verifying test data:', error.message);
    return { systems: 0, assets: 0 };
  }
}

// Test Supabase connection
export async function testSupabaseConnection() {
  try {
    const { data, error } = await testSupabase
      .from('boat_systems')
      .select('count', { count: 'exact', head: true });

    if (error) throw error;

    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}