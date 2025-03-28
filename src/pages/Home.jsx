import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Home() {
  const { user } = useAuth();

  return (
    <div className="relative">
      {/* Hero section */}
      <div className="py-12 md:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">Bridge the gap between</span>
            <span className="block text-primary-600">theory and practice</span>
          </h1>
          <p className="mt-6 text-xl text-gray-500 max-w-3xl mx-auto">
            AbstructionAI helps students in technical and engineering fields understand complex concepts through personalized explanations and real-world analogies.
          </p>
          <div className="mt-10 flex justify-center">
            {user ? (
              <Link
                to="/query"
                className="btn btn-primary text-lg px-8 py-3"
              >
                Start Learning
              </Link>
            ) : (
              <Link
                to="/register"
                className="btn btn-primary text-lg px-8 py-3"
              >
                Get Started
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Features section */}
      <div className="py-12 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">
              How AbstructionAI Works
            </h2>
            <p className="mt-4 text-lg text-gray-500 max-w-3xl mx-auto">
              Our platform uses advanced AI to create personalized learning experiences
            </p>
          </div>

          <div className="mt-16">
            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="w-12 h-12 rounded-md bg-primary-600 flex items-center justify-center text-white text-xl font-bold">
                  1
                </div>
                <h3 className="mt-4 text-xl font-medium text-gray-900">Submit Your Query</h3>
                <p className="mt-2 text-gray-500">
                  Ask about any complex technical concept you're struggling to understand.
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="w-12 h-12 rounded-md bg-primary-600 flex items-center justify-center text-white text-xl font-bold">
                  2
                </div>
                <h3 className="mt-4 text-xl font-medium text-gray-900">Get Tailored Explanations</h3>
                <p className="mt-2 text-gray-500">
                  Receive clear explanations and real-world analogies that match your learning style.
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="w-12 h-12 rounded-md bg-primary-600 flex items-center justify-center text-white text-xl font-bold">
                  3
                </div>
                <h3 className="mt-4 text-xl font-medium text-gray-900">Provide Feedback</h3>
                <p className="mt-2 text-gray-500">
                  Rate responses to help the system better understand your learning preferences.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Testimonials section */}
      <div className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">
              What Students Are Saying
            </h2>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-gray-600 italic">
                "AbstructionAI helped me finally understand quantum mechanics by relating it to everyday experiences. The analogies were spot on!"
              </p>
              <div className="mt-4 flex items-center">
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Alex Johnson</p>
                  <p className="text-sm text-gray-500">Physics Student</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-gray-600 italic">
                "I was struggling with complex algorithms until I used this platform. The way it breaks down concepts is revolutionary."
              </p>
              <div className="mt-4 flex items-center">
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">Maria Garcia</p>
                  <p className="text-sm text-gray-500">Computer Science Major</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-gray-600 italic">
                "The personalized learning approach adapts to how I think. It's like having a tutor who knows exactly how to explain things to me."
              </p>
              <div className="mt-4 flex items-center">
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-900">James Wilson</p>
                  <p className="text-sm text-gray-500">Engineering Student</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div className="bg-primary-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-white">
              Ready to transform your learning experience?
            </h2>
            <p className="mt-4 text-xl text-primary-100 max-w-3xl mx-auto">
              Join thousands of students who are bridging the gap between theory and practice.
            </p>
            <div className="mt-8">
              {user ? (
                <Link
                  to="/dashboard"
                  className="btn bg-white text-primary-700 hover:bg-gray-100 text-lg px-8 py-3"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <Link
                  to="/register"
                  className="btn bg-white text-primary-700 hover:bg-gray-100 text-lg px-8 py-3"
                >
                  Sign Up Now
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;