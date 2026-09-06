import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const cityToState: Record<string, string> = {
  'Mumbai': 'Maharashtra',
  'Pune': 'Maharashtra',
  'Delhi': 'Delhi',
  'Bangalore': 'Karnataka',
  'Hyderabad': 'Telangana',
  'Chennai': 'Tamil Nadu',
  'Kolkata': 'West Bengal',
  'San Francisco': 'California',
  'New York': 'New York',
  'London': 'England'
};

const cityToCountry: Record<string, string> = {
  'Mumbai': 'India',
  'Pune': 'India',
  'Delhi': 'India',
  'Bangalore': 'India',
  'Hyderabad': 'India',
  'Chennai': 'India',
  'Kolkata': 'India',
  'San Francisco': 'United States',
  'New York': 'United States',
  'London': 'United Kingdom'
};

async function main() {
  const activities = await prisma.activity.findMany({
    where: {
      city: { not: null },
      state: null
    }
  });

  console.log(`Found ${activities.length} activities to update.`);

  for (const activity of activities) {
    if (activity.city) {
      const state = cityToState[activity.city];
      const country = cityToCountry[activity.city];
      
      if (state && country) {
        await prisma.activity.update({
          where: { id: activity.id },
          data: { state, country }
        });
        console.log(`Updated activity ${activity.title} (${activity.city}) -> ${state}, ${country}`);
      }
    }
  }

  const profiles = await prisma.profile.findMany({
    where: {
      city: { not: null },
      state: null
    }
  });

  console.log(`Found ${profiles.length} profiles to update.`);

  for (const profile of profiles) {
    if (profile.city) {
      const state = cityToState[profile.city];
      const country = cityToCountry[profile.city];
      
      if (state && country) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { state, country }
        });
        console.log(`Updated profile ${profile.id} (${profile.city}) -> ${state}, ${country}`);
      }
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
